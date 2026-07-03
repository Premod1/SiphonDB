mod ssh_tunnel;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ssh_tunnel::TunnelState(std::sync::Mutex::new(std::collections::HashMap::new())))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ssh_tunnel::start_ssh_tunnel,
            ssh_tunnel::stop_ssh_tunnel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
