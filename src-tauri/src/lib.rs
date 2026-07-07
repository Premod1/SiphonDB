mod ssh_tunnel;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn append_text_file(path: String, content: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct DumpParams {
    db_type: String,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    database_name: String,
    target_path: String,
}

#[tauri::command]
fn run_native_dump(params: DumpParams) -> Result<(), String> {
    use std::process::Command;
    
    if params.db_type == "sqlite" {
        std::fs::copy(&params.database_name, &params.target_path)
            .map(|_| ())
            .map_err(|e| format!("Failed to copy SQLite file: {}", e))
    } else if params.db_type == "mysql" {
        let host = params.host.unwrap_or_else(|| "127.0.0.1".to_string());
        let port = params.port.unwrap_or(3306).to_string();
        let username = params.username.unwrap_or_else(|| "root".to_string());
        
        let mut cmd = Command::new("mysqldump");
        cmd.arg("-h").arg(&host)
           .arg("-P").arg(&port)
           .arg("-u").arg(&username)
           .arg(&params.database_name);
           
        if let Some(ref pwd) = params.password {
            cmd.env("MYSQL_PWD", pwd);
        }
        
        let output_file = std::fs::File::create(&params.target_path)
            .map_err(|e| format!("Failed to create output file: {}", e))?;
        
        cmd.stdout(output_file);
        
        let status = cmd.status()
            .map_err(|e| format!("Failed to run mysqldump: {}. Make sure 'mysqldump' is installed and in your PATH.", e))?;
            
        if status.success() {
            Ok(())
        } else {
            Err("mysqldump exited with error status".to_string())
        }
    } else if params.db_type == "postgres" {
        let host = params.host.unwrap_or_else(|| "127.0.0.1".to_string());
        let port = params.port.unwrap_or(5432).to_string();
        let username = params.username.unwrap_or_else(|| "postgres".to_string());
        
        let mut cmd = Command::new("pg_dump");
        cmd.arg("-h").arg(&host)
           .arg("-p").arg(&port)
           .arg("-U").arg(&username)
           .arg("-f").arg(&params.target_path)
           .arg(&params.database_name);
           
        if let Some(ref pwd) = params.password {
            cmd.env("PGPASSWORD", pwd);
        }
        
        let status = cmd.status()
            .map_err(|e| format!("Failed to run pg_dump: {}. Make sure 'pg_dump' is installed and in your PATH.", e))?;
            
        if status.success() {
            Ok(())
        } else {
            Err("pg_dump exited with error status".to_string())
        }
    } else {
        Err(format!("Unsupported database type: {}", params.db_type))
    }
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
            ssh_tunnel::stop_ssh_tunnel,
            save_file,
            append_text_file,
            run_native_dump
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
