mod fs;

/// 应用数据目录（暂存区、journal 都放这里）。
/// 交给 Tauri 解析，不要在前端硬编码盘符。
#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|p| fs::fwd(&p))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_data_dir,
            fs::scan_dir,
            fs::list_dir,
            fs::path_exists,
            fs::mkdirp,
            fs::move_path,
            fs::copy_path,
            fs::trash_path,
            fs::restore_path,
            fs::free_space,
            fs::can_write,
            fs::all_file_paths,
            fs::has_child,
        ])
        .run(tauri::generate_context!())
        .expect("鉴易启动失败");
}
