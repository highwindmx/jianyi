/**
 * 内核自检：不依赖浏览器，直接用 node 跑。
 *   npm run check
 * 它同时是设计文档第 ⑤ 节所有数字的来源。
 */
import { buildDemoFs } from '../src/core/mock/generate.ts';
import { demoPipeline } from '../src/core/mock/presets.ts';
import { compilePipeline, defaultContext } from '../src/core/engine/compile.ts';
import { makeItem } from '../src/core/model/item.ts';
import { executePlan } from '../src/core/exec/executor.ts';
import { rollbackJournal } from '../src/core/exec/rollback.ts';

const line = (s = '') => console.log(s);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

async function main() {
  const fs = buildDemoFs();
  const a = fs.adapter;
  line('═'.repeat(78));
  line('演示文件系统');
  line('═'.repeat(78));
  const st0 = a.stats();
  line(`根目录 ${fs.root} · 文件 ${st0.files} 个 · 目录 ${st0.dirs} 个 · 共 ${(st0.bytes / 1024 ** 3).toFixed(1)} GB`);
  line(`预置冲突文件 ${fs.seededConflicts.length} 个：${fs.seededConflicts.slice(0, 3).join(' | ')} …`);

  const scanned = await a.scanDir(fs.root, { recursive: true, includeHidden: false });
  const items = scanned.map((e) => makeItem(e.path, e.size, e.mtimeMs));
  line(`扫描结果 ${items.length} 个文件（recursive=true, includeHidden=false）`);
  const withHidden = await a.scanDir(fs.root, { recursive: true, includeHidden: true });
  line(`含隐藏文件时 ${withHidden.length} 个`);
  line();

  const doc = demoPipeline();
  const world = {
    existingPaths: new Set((await a.allFilePaths()).map((p) => p.toLowerCase())),
    caseInsensitiveFs: true,
    freeBytes: await a.freeSpace(fs.root),
  };

  const t0 = performance.now();
  const r1 = compilePipeline(doc, items, { world, ctx: defaultContext() });
  const tCold = performance.now() - t0;

  line('═'.repeat(78));
  line('逐级预览读数（首次编译，全量）');
  line('═'.repeat(78));
  line(pad('#', 3) + pad('积木', 16) + pad('参与后续', 10) + pad('本步改写', 10) + pad('本步排除', 10) + pad('耗时', 8));
  r1.stages.forEach((s, i) => {
    line(
      pad(i + 1, 3) +
        pad(s.title, 16) +
        pad(s.stats.active, 10) +
        pad(s.stats.changed, 10) +
        pad(s.stats.dropped, 10) +
        pad(s.durationMs.toFixed(1) + 'ms', 8),
    );
  });
  line();
  line(`总耗时 ${tCold.toFixed(1)}ms（含冲突检测与策略应用）`);

  // 增量：改最后一步参数，应当只重算最后一步
  const doc2 = structuredClone(doc);
  doc2.steps[6].params = { ...doc2.steps[6].params, targetDir: 'D:/整理/音乐2' };
  const t1 = performance.now();
  const r2 = compilePipeline(doc2, items, { world, ctx: defaultContext(), cache: r1.cache });
  const tWarm = performance.now() - t1;
  line(`增量重算（只改最后一步）：${tWarm.toFixed(1)}ms，命中缓存 ${r2.stages.filter((s) => s.cached).length}/${r2.stages.length} 步`);

  line();
  line('═'.repeat(78));
  line('变更计划');
  line('═'.repeat(78));
  const sum = r1.summary;
  line(`改名 ${sum.rename} · 移动 ${sum.move} · 复制 ${sum.copy} · 删除 ${sum.delete} · 保留 ${sum.keep}`);
  line(`冲突 ${sum.conflict} 个（策略已处理 ${r1.policyResolved} 个），仍阻塞 ${r1.blocking.length} 个`);
  line(`需落盘 ${(sum.totalBytes / 1024 ** 3).toFixed(2)} GB`);
  line();
  line('冲突明细：');
  const byCode = new Map<string, number>();
  for (const c of r1.conflicts) byCode.set(c.code, (byCode.get(c.code) ?? 0) + 1);
  for (const [k, v] of byCode) line(`  ${pad(k, 20)} ${v}`);
  line();
  line('计划样例（前 3 条 + 冲突 1 条）：');
  for (const e of r1.plan.filter((x) => x.action !== 'keep').slice(0, 3)) {
    line(`  { action: '${e.action}', from: '${e.from}', to: '${e.to}', reason: '${e.reason}' }`);
  }
  const cf = r1.plan.find((e) => e.to && /\(2\)/.test(e.to));
  if (cf) line(`  { action: '${cf.action}', to: '${cf.to}', reason: '${cf.reason}' }  ← 冲突已自动重命名`);

  line();
  line('═'.repeat(78));
  line('执行 → 撤销');
  line('═'.repeat(78));
  const before = a.stats().files;
  const targetBefore = (await a.listDir(fs.target)).length;

  const j = await executePlan(r1.plan, {
    adapter: a,
    appDataDir: 'D:/.jianyi',
    onProgress: () => {},
  });
  const after = a.stats().files;
  const targetAfter = (await a.listDir(fs.target)).length;
  line(`执行 ${j.entries.length} 个文件操作，状态 ${j.status}`);
  line(`目标目录 ${targetBefore} → ${targetAfter} 个文件`);
  line(`全盘文件数 ${before} → ${after}（应不变：移动不是增删）`);

  const restored = await rollbackJournal(j, a, 'D:/.jianyi');
  const targetRestored = (await a.listDir(fs.target)).length;
  line(`撤销状态 ${restored.status}${restored.failures ? `（失败 ${restored.failures.length} 条）` : ''}`);
  line(`目标目录恢复到 ${targetRestored} 个文件（应为 ${targetBefore}）`);
  line(`全盘文件数 ${a.stats().files}（应为 ${before}）`);

  line();
  line('═'.repeat(78));
  line('故障注入：第 200 个写操作失败 → 验证逆序回滚');
  line('═'.repeat(78));
  const a2 = buildDemoFs().adapter;
  const r3 = compilePipeline(doc, items, {
    world: {
      existingPaths: new Set((await a2.allFilePaths()).map((p) => p.toLowerCase())),
      caseInsensitiveFs: true,
      freeBytes: await a2.freeSpace(fs.root),
    },
    ctx: defaultContext(),
  });
  a2.failAtOp = 200;
  try {
    await executePlan(r3.plan, { adapter: a2, appDataDir: 'D:/.jianyi' });
    line('没有抛出错误（不符合预期）');
  } catch (e) {
    const jj = (e as { journal: typeof j }).journal;
    line(`执行中断：${(e as Error).message}`);
    line(`已完成 ${jj.entries.length} 个操作，状态 ${jj.status}`);
    const rb = await rollbackJournal(jj, a2, 'D:/.jianyi');
    line(`回滚状态 ${rb.status}，失败 ${rb.failures?.length ?? 0} 条`);
    line(`回滚后目标目录 ${(await a2.listDir(fs.target)).length} 个文件（应为 ${targetBefore}）`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
