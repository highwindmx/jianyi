/**
 * 平台适配层：core 层与真实磁盘之间**唯一**的契约。
 *
 * 两个实现：
 * - `mock/memoryAdapter` —— 内存文件系统，零 IO、可注入失败，用于演示与自检
 * - `tauri/tauriAdapter` —— 真磁盘，每个方法背后是一条 Rust 命令
 *
 * core / ui / state 只认这个接口，不认具体实现。
 */

export interface ScanEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface ScanOptions {
  recursive: boolean;
  includeHidden: boolean;
}

export interface PlatformAdapter {
  readonly kind: 'mock' | 'tauri';
  /** 文件系统是否大小写不敏感。Windows / macOS 默认 true，Linux false */
  readonly caseInsensitiveFs: boolean;

  /** 扫描源文件夹 */
  scanDir(root: string, opts: ScanOptions): Promise<ScanEntry[]>;
  /** 列出某目录下直接子项的名字 */
  listDir(dir: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  mkdirp(dir: string): Promise<void>;
  /** 同盘是原子 rename；跨盘内部自动 copy+delete，并回报 crossDevice */
  move(from: string, to: string): Promise<{ crossDevice: boolean }>;
  copy(from: string, to: string): Promise<void>;
  /** 移入暂存区，返回暂存区里的实际路径 */
  trash(from: string, trashDir: string): Promise<string>;
  restore(trashPath: string, to: string): Promise<void>;
  freeSpace(dir: string): Promise<number | null>;
  canWrite(dir: string): Promise<boolean>;
  /**
   * 供冲突检测构建"世界"的文件路径集合。
   *
   * `scope` 是**必须**的：真机上不可能遍历整块盘。传源目录 + 各个目标目录，
   * 只在这些范围内建索引。mock 实现忽略此参数（它本来就只有那么多文件）。
   */
  allFilePaths(scope?: string[]): Promise<string[]>;
  /** 目录下是否已有同名项（大小写不敏感） */
  hasChild(dir: string, name: string): Promise<boolean>;
}

