//! 文件系统命令层 —— 前端 `PlatformAdapter` 的 Rust 实现。
//!
//! 为什么不用 `plugin-fs`：一次扫描 2000+ 文件，如果每个文件都往返一次 IPC，
//! 光序列化就吃掉几百毫秒。这里把「递归遍历 + stat」压进一个命令里，
//! 一次 IPC 拿回整个目录树。

use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

fn e2s(e: io::Error) -> String {
    e.to_string()
}

/// 统一成正斜杠、去掉 `canonicalize` 带出来的 `\\?\` 前缀。
/// 前端 `normPath()` 用的就是正斜杠，两边必须一致。
pub fn fwd(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    s.strip_prefix("//?/").unwrap_or(&s).to_string()
}

/// 把前端的正斜杠路径转成**能真正打开文件**的 OS 路径。
///
/// Windows 上 `CreateFileW` 会静默吃掉路径结尾的空格和点 ——
/// 于是 `周杰伦 - 七里香.mp3 `（尾随空格）这种文件明明在，
/// `exists()` 却返回 false，执行器报"源文件不存在"。
/// 加 `\\?\` verbatim 前缀可以关掉这层规范化。
///
/// 注意 verbatim 路径只认反斜杠、不解析 `.` / `..`，所以这里做一次转换；
/// 相对路径不加前缀（加了反而不合法）。
#[cfg(windows)]
fn os_path(p: &str) -> PathBuf {
    let s = p.replace('/', "\\");
    if s.starts_with("\\\\?\\") {
        return PathBuf::from(s);
    }
    let b = s.as_bytes();
    if b.len() >= 2 && b[1] == b':' {
        return PathBuf::from(format!("\\\\?\\{s}"));
    }
    PathBuf::from(s)
}

#[cfg(not(windows))]
fn os_path(p: &str) -> PathBuf {
    PathBuf::from(p)
}

/// 隐藏判定：点开头，或 Windows 的 hidden 属性。
/// 根目录自己不算（否则扫 `.config` 这种目录会直接扫空）。
fn is_hidden(e: &walkdir::DirEntry) -> bool {
    if e.depth() == 0 {
        return false;
    }
    if e.file_name().to_string_lossy().starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        if let Ok(md) = e.metadata() {
            if md.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0 {
                return true;
            }
        }
    }
    false
}

/// 17 = EXDEV（unix）/ ERROR_NOT_SAME_DEVICE（windows）。
/// 跨盘时 rename 必然失败，要降级成 copy + delete。
fn is_cross_device(e: &io::Error) -> bool {
    e.raw_os_error() == Some(17)
}

fn copy_any(src: &Path, dst: &Path) -> Result<(), String> {
    let md = fs::metadata(src).map_err(e2s)?;
    if md.is_dir() {
        fs::create_dir_all(dst).map_err(e2s)?;
        for ent in fs::read_dir(src).map_err(e2s)? {
            let ent = ent.map_err(e2s)?;
            copy_any(&ent.path(), &dst.join(ent.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ()).map_err(e2s)
    }
}

fn remove_any(p: &Path) -> Result<(), String> {
    let md = fs::metadata(p).map_err(e2s)?;
    if md.is_dir() {
        fs::remove_dir_all(p).map_err(e2s)
    } else {
        fs::remove_file(p).map_err(e2s)
    }
}

/* ─────────────────────────── 命令 ─────────────────────────── */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanEntry {
    pub path: String,
    pub size: u64,
    pub mtime_ms: f64,
}

#[tauri::command]
pub fn scan_dir(
    root: String,
    recursive: bool,
    include_hidden: bool,
) -> Result<Vec<ScanEntry>, String> {
    let root = os_path(&root);
    if !root.is_dir() {
        return Err(format!("不是文件夹：{}", root.display()));
    }

    let mut walker = walkdir::WalkDir::new(&root).follow_links(false);
    if !recursive {
        walker = walker.max_depth(1);
    }

    let mut out = Vec::new();
    for ent in walker.into_iter().filter_entry(|e| include_hidden || !is_hidden(e)) {
        let ent = match ent {
            Ok(e) => e,
            // 单个条目没权限不该让整次扫描失败，跳过即可
            Err(_) => continue,
        };
        if !ent.file_type().is_file() {
            continue;
        }
        let md = match ent.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime_ms = md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64)
            .unwrap_or(0.0);
        out.push(ScanEntry {
            path: fwd(ent.path()),
            size: md.len(),
            mtime_ms,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[tauri::command]
pub fn list_dir(dir: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for ent in fs::read_dir(os_path(&dir)).map_err(e2s)? {
        let ent = match ent {
            Ok(e) => e,
            Err(_) => continue,
        };
        out.push(ent.file_name().to_string_lossy().to_string());
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(os_path(&path).exists())
}

#[tauri::command]
pub fn mkdirp(dir: String) -> Result<(), String> {
    fs::create_dir_all(os_path(&dir)).map_err(e2s)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveResult {
    pub cross_device: bool,
}

#[tauri::command]
pub fn move_path(from: String, to: String) -> Result<MoveResult, String> {
    let src = os_path(&from);
    let dst = os_path(&to);

    if !src.exists() {
        return Err(format!("源文件不存在：{from}"));
    }
    if let Some(parent) = dst.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(e2s)?;
        }
    }

    // 只改大小写：Windows 上 MoveFileEx 对同一文件的大小写改名不可靠
    // （经常静默成功但名字没变），走临时名两步。
    let same_lower = src.to_string_lossy().to_lowercase() == dst.to_string_lossy().to_lowercase();
    if same_lower {
        let tmp = dst.with_file_name(format!(".jy_tmp_{}", std::process::id()));
        fs::rename(&src, &tmp).map_err(e2s)?;
        fs::rename(&tmp, &dst).map_err(e2s)?;
        return Ok(MoveResult { cross_device: false });
    }

    // 非大小写变更时，目标已存在要报错 —— 和 mock adapter 语义一致。
    // 冲突在计划阶段就处理完了（skip / autoRename / overwrite 先备份），
    // 走到这里还撞上说明是并发写入，宁可停下也不要静默覆盖。
    if dst.exists() {
        return Err(format!("目标已存在：{to}"));
    }

    match fs::rename(&src, &dst) {
        Ok(()) => Ok(MoveResult { cross_device: false }),
        Err(e) if is_cross_device(&e) => {
            copy_any(&src, &dst)?;
            remove_any(&src)?;
            Ok(MoveResult { cross_device: true })
        }
        Err(e) => Err(e2s(e)),
    }
}

#[tauri::command]
pub fn copy_path(from: String, to: String) -> Result<(), String> {
    let dst = os_path(&to);
    if dst.exists() {
        return Err(format!("目标已存在：{to}"));
    }
    if let Some(parent) = dst.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(e2s)?;
        }
    }
    copy_any(&os_path(&from), &dst)
}

/// 移入暂存区，返回暂存区里的实际路径。
/// 同名就加 `(2)` 后缀 —— 暂存区里绝不能覆盖已暂存的文件，否则撤销链会断。
#[tauri::command]
pub fn trash_path(from: String, trash_dir: String) -> Result<String, String> {
    let src = os_path(&from);
    if !src.exists() {
        return Err(format!("源文件不存在：{from}"));
    }
    let trash_root = os_path(&trash_dir);
    fs::create_dir_all(&trash_root).map_err(e2s)?;

    let name = src
        .file_name()
        .ok_or_else(|| format!("无效路径：{from}"))?
        .to_string_lossy()
        .to_string();

    let mut dst = trash_root.join(&name);
    if dst.exists() {
        let (base, ext) = match name.rfind('.') {
            Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()),
            _ => (name.clone(), String::new()),
        };
        for i in 2..100_000 {
            let cand = trash_root.join(format!("{base} ({i}){ext}"));
            if !cand.exists() {
                dst = cand;
                break;
            }
        }
    }

    match fs::rename(&src, &dst) {
        Ok(()) => Ok(fwd(&dst)),
        Err(e) if is_cross_device(&e) => {
            copy_any(&src, &dst)?;
            remove_any(&src)?;
            Ok(fwd(&dst))
        }
        Err(e) => Err(e2s(e)),
    }
}

#[tauri::command]
pub fn restore_path(trash_path: String, to: String) -> Result<(), String> {
    let src = os_path(&trash_path);
    if !src.exists() {
        return Err(format!("暂存区文件不存在：{trash_path}"));
    }
    let dst = os_path(&to);
    if let Some(parent) = dst.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(e2s)?;
        }
    }
    match fs::rename(&src, &dst) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => {
            copy_any(&src, &dst)?;
            remove_any(&src)?;
            Ok(())
        }
        Err(e) => Err(e2s(e)),
    }
}

#[tauri::command]
pub fn free_space(dir: String) -> Result<Option<u64>, String> {
    Ok(fs4::available_space(os_path(&dir)).ok())
}

#[tauri::command]
pub fn can_write(dir: String) -> Result<bool, String> {
    let mut p = os_path(&dir);
    // 目标目录可能还不存在（第一次执行时很常见）。往上找到最近一个存在的祖先再探针 ——
    // 祖先可写就意味着我们有能力把目录建出来，不能因为"还没建"就判成"没权限"。
    while !p.exists() {
        match p.parent() {
            Some(parent) if parent != p => p = parent.to_path_buf(),
            _ => return Ok(false),
        }
    }
    if p.is_file() {
        return Ok(false);
    }
    let probe = p.join(format!(".jy_probe_{}", std::process::id()));
    match fs::write(&probe, b"") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

/// 冲突检测要的"世界"。**不是全盘遍历** —— 只走调用方给的 scope
/// （源目录 + 各个目标目录），否则在大盘上会卡死。
#[tauri::command]
pub fn all_file_paths(scope: Vec<String>) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for dir in scope {
        if dir.is_empty() {
            continue;
        }
        for ent in walkdir::WalkDir::new(os_path(&dir))
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if ent.file_type().is_file() {
                out.push(fwd(ent.path()));
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

#[tauri::command]
pub fn has_child(dir: String, name: String) -> Result<bool, String> {
    let target = name.to_lowercase();
    for ent in fs::read_dir(os_path(&dir)).map_err(e2s)? {
        let ent = match ent {
            Ok(e) => e,
            Err(_) => continue,
        };
        if ent.file_name().to_string_lossy().to_lowercase() == target {
            return Ok(true);
        }
    }
    Ok(false)
}

/* ─────────────────────────── 测试 ─────────────────────────── */
/* 这些命令都是纯函数（只有 app_data_dir 需要 AppHandle），
   所以可以脱离 Tauri 运行时直接测。GUI 点不出来，只能这么验。 */

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("jianyi_t_{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn touch(p: &Path, body: &str) {
        if let Some(d) = p.parent() {
            fs::create_dir_all(d).unwrap();
        }
        let mut f = fs::File::create(p).unwrap();
        f.write_all(body.as_bytes()).unwrap();
    }

    #[test]
    fn scan_respects_recursion_and_hidden() {
        let root = tmp("scan");
        touch(&root.join("a.mp3"), "1");
        touch(&root.join("sub/b.mp3"), "22");
        touch(&root.join(".hidden.mp3"), "333");

        let flat = scan_dir(fwd(&root), false, false).unwrap();
        assert_eq!(flat.len(), 1, "不递归时只该看到第一层");
        assert_eq!(flat[0].size, 1);

        let deep = scan_dir(fwd(&root), true, false).unwrap();
        assert_eq!(deep.len(), 2, "递归时应含子目录，但不含隐藏文件");

        let with_hidden = scan_dir(fwd(&root), true, true).unwrap();
        assert_eq!(with_hidden.len(), 3);
    }

    #[test]
    fn scan_returns_forward_slash_paths() {
        let root = tmp("slash");
        touch(&root.join("x.txt"), "hi");
        let out = scan_dir(fwd(&root), true, false).unwrap();
        assert!(!out[0].path.contains('\\'), "路径必须是正斜杠：{}", out[0].path);
        assert!(out[0].mtime_ms > 0.0);
    }

    #[test]
    fn move_renames_across_dirs() {
        let root = tmp("move");
        touch(&root.join("a.txt"), "body");
        let res = move_path(fwd(&root.join("a.txt")), fwd(&root.join("sub/a.txt"))).unwrap();
        assert!(!res.cross_device);
        assert!(root.join("sub/a.txt").exists());
        assert!(!root.join("a.txt").exists());
    }

    #[test]
    fn move_refuses_existing_target() {
        let root = tmp("move_conflict");
        touch(&root.join("a.txt"), "a");
        touch(&root.join("b.txt"), "b");
        let err = move_path(fwd(&root.join("a.txt")), fwd(&root.join("b.txt")));
        assert!(err.is_err(), "目标已存在时必须报错，不能静默覆盖");
        assert_eq!(fs::read_to_string(root.join("b.txt")).unwrap(), "b");
    }

    #[test]
    fn move_errors_on_missing_source() {
        let root = tmp("move_missing");
        assert!(move_path(fwd(&root.join("nope.txt")), fwd(&root.join("x.txt"))).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn case_only_rename_actually_changes_case() {
        let root = tmp("caseonly");
        touch(&root.join("song.mp3"), "x");
        move_path(fwd(&root.join("song.mp3")), fwd(&root.join("Song.mp3"))).unwrap();
        let names = list_dir(fwd(&root)).unwrap();
        assert_eq!(names, vec!["Song.mp3".to_string()], "大小写必须真的改掉，实际：{:?}", names);
    }

    #[test]
    fn trash_dedups_instead_of_overwriting() {
        let root = tmp("trash");
        let bin = root.join("bin");
        touch(&root.join("same.txt"), "first");
        let p1 = trash_path(fwd(&root.join("same.txt")), fwd(&bin)).unwrap();
        touch(&root.join("same.txt"), "second");
        let p2 = trash_path(fwd(&root.join("same.txt")), fwd(&bin)).unwrap();

        assert_ne!(p1, p2, "暂存区里同名文件不能互相覆盖");
        assert_eq!(fs::read_to_string(&p1).unwrap(), "first");
        assert_eq!(fs::read_to_string(&p2).unwrap(), "second");
        assert!(p2.contains("(2)"), "第二个应该加 (2) 后缀：{p2}");
    }

    #[test]
    fn restore_puts_file_back() {
        let root = tmp("restore");
        let bin = root.join("bin");
        touch(&root.join("r.txt"), "data");
        let trashed = trash_path(fwd(&root.join("r.txt")), fwd(&bin)).unwrap();
        assert!(!root.join("r.txt").exists());

        restore_path(trashed.clone(), fwd(&root.join("r.txt"))).unwrap();
        assert!(root.join("r.txt").exists());
        assert_eq!(fs::read_to_string(root.join("r.txt")).unwrap(), "data");
        assert!(!Path::new(&trashed).exists());
    }

    #[test]
    fn all_file_paths_only_walks_given_scope() {
        let a = tmp("scope_a");
        let b = tmp("scope_b");
        touch(&a.join("in_a.txt"), "1");
        touch(&b.join("in_b.txt"), "2");

        let out = all_file_paths(vec![fwd(&a)]).unwrap();
        assert_eq!(out.len(), 1, "只该走 scope 里的目录");
        assert!(out[0].ends_with("in_a.txt"));

        let both = all_file_paths(vec![fwd(&a), fwd(&b)]).unwrap();
        assert_eq!(both.len(), 2);

        assert!(all_file_paths(vec![]).unwrap().is_empty());
    }

    #[test]
    fn has_child_is_case_insensitive() {
        let root = tmp("haschild");
        touch(&root.join("Report.PDF"), "x");
        assert!(has_child(fwd(&root), "report.pdf".into()).unwrap());
        assert!(!has_child(fwd(&root), "missing.pdf".into()).unwrap());
    }

    #[test]
    fn list_dir_on_missing_dir_errors() {
        let root = tmp("nodir");
        assert!(list_dir(fwd(&root.join("nope"))).is_err());
    }

    #[test]
    fn can_write_and_free_space() {
        let root = tmp("writable");
        assert!(can_write(fwd(&root)).unwrap());
        // 探针文件不能留下
        assert!(list_dir(fwd(&root)).unwrap().is_empty());
        assert!(free_space(fwd(&root)).unwrap().unwrap_or(0) > 0);
    }

    #[test]
    fn can_write_allows_not_yet_existing_dir() {
        // 第一次执行时目标目录往往还不存在。预检不能因此判定"没权限"，
        // 否则用户永远建不出第一个目标目录（这个 bug 在真机上才暴露）。
        let root = tmp("writable_future");
        let future = root.join("还没建的目录/更深一层");
        assert!(can_write(fwd(&future)).unwrap(), "不存在的目录应判为可写");
        assert!(!future.exists(), "探针不该真的把目录建出来");
    }

    #[test]
    fn mkdirp_is_idempotent() {
        let root = tmp("mkdirp");
        let deep = root.join("a/b/c");
        mkdirp(fwd(&deep)).unwrap();
        mkdirp(fwd(&deep)).unwrap();
        assert!(deep.is_dir());
    }

    #[cfg(windows)]
    #[test]
    fn trailing_space_filename_is_visible_and_movable() {
        // Windows 的 CreateFileW 会吃掉结尾空格，导致 exists() 说谎。
        // 这个用例守住 os_path() 的 verbatim 前缀逻辑。
        let root = tmp("trailspace");
        let raw = format!("\\\\?\\{}\\song.mp3 ", fwd(&root).replace('/', "\\"));
        fs::write(&raw, b"x").unwrap();

        let scanned = scan_dir(fwd(&root), true, false).unwrap();
        assert_eq!(scanned.len(), 1, "扫描必须看得到带尾随空格的文件");
        assert!(scanned[0].path.ends_with("song.mp3 "), "尾随空格要保留：{:?}", scanned[0].path);

        let to = format!("{}/song.mp3", fwd(&root.join("out")));
        move_path(scanned[0].path.clone(), to.clone()).expect("带尾随空格的文件应该能被移动");
        assert!(os_path(&to).exists());
        assert!(!os_path(&scanned[0].path).exists(), "源文件应已移走");
    }
}
