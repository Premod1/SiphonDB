use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::io::{Read, Write};
use ssh2::Session;

pub struct TunnelInfo {
    pub local_port: u16,
    pub running: Arc<AtomicBool>,
}

pub struct TunnelState(pub Mutex<HashMap<u32, TunnelInfo>>);

// Helper function to bridge two TCP/channel streams bidirectionally without deadlocking
fn bridge_streams(mut a: TcpStream, mut b: ssh2::Channel, sess: ssh2::Session) {
    let mut a_clone = match a.try_clone() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to clone local TCP stream: {}", e);
            return;
        }
    };
    let mut b_clone = b.clone();

    // Set short read timeouts on local TCP streams to yield lock periodically
    let _ = a.set_read_timeout(Some(std::time::Duration::from_millis(50)));
    let _ = a_clone.set_read_timeout(Some(std::time::Duration::from_millis(50)));

    // Set short timeout on SSH session to yield lock periodically
    sess.set_timeout(50);

    // Spawn thread to copy from local stream to SSH channel
    thread::spawn(move || {
        let mut buffer = [0; 8192];
        loop {
            match a_clone.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    if b_clone.write_all(&buffer[..n]).is_err() {
                        break;
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock || 
                              e.kind() == std::io::ErrorKind::TimedOut => {
                    thread::yield_now();
                }
                Err(_) => break, // Actual error
            }
        }
        let _ = b_clone.close();
    });

    // Copy from SSH channel to local stream in this thread
    let mut buffer = [0; 8192];
    loop {
        match b.read(&mut buffer) {
            Ok(0) => break, // EOF
            Ok(n) => {
                if a.write_all(&buffer[..n]).is_err() {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock || 
                          e.kind() == std::io::ErrorKind::TimedOut ||
                          e.to_string().to_lowercase().contains("timeout") => {
                thread::yield_now();
            }
            Err(_) => break, // Actual error
        }
    }
}

// Handler for a single client database connection, establishing its own SSH session
fn handle_single_connection(
    local_stream: TcpStream,
    ssh_host: String,
    ssh_port: u16,
    ssh_username: String,
    ssh_password: Option<String>,
    ssh_key_path: Option<String>,
    remote_db_host: String,
    remote_db_port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::net::ToSocketAddrs;
    let ssh_addr = format!("{}:{}", ssh_host, ssh_port);
    let mut addrs = ssh_addr.to_socket_addrs()
        .map_err(|e| format!("Failed to resolve SSH hostname {}: {}", ssh_host, e))?;
    let socket_addr = addrs.next()
        .ok_or_else(|| format!("Could not resolve SSH hostname {}", ssh_host))?;
    let tcp_conn = TcpStream::connect_timeout(&socket_addr, std::time::Duration::from_secs(10))?;

    let mut sess = Session::new().map_err(|e| format!("Failed to create SSH session: {}", e))?;
    sess.set_tcp_stream(tcp_conn);
    sess.handshake().map_err(|e| format!("SSH Handshake failed: {}", e))?;

    if let Some(key_path) = ssh_key_path.filter(|p| !p.trim().is_empty()) {
        sess.userauth_pubkey_file(
            &ssh_username,
            None,
            std::path::Path::new(&key_path),
            ssh_password.as_deref().filter(|p| !p.trim().is_empty()),
        )?;
    } else if let Some(pass) = ssh_password {
        sess.userauth_password(&ssh_username, &pass)?;
    } else {
        return Err("No SSH Password or Keyfile provided".into());
    }

    if !sess.authenticated() {
        return Err("SSH Authentication failed".into());
    }

    let channel = sess.channel_direct_tcpip(&remote_db_host, remote_db_port, None)?;

    bridge_streams(local_stream, channel, sess);

    Ok(())
}

#[tauri::command]
pub fn start_ssh_tunnel(
    state: tauri::State<'_, TunnelState>,
    id: u32,
    ssh_host: String,
    ssh_port: u16,
    ssh_username: String,
    ssh_password: Option<String>,
    ssh_key_path: Option<String>,
    remote_db_host: String,
    remote_db_port: u16,
) -> Result<u16, String> {
    // 1. Check if tunnel already running for this connection profile ID
    {
        let map = state.0.lock().unwrap();
        if let Some(tunnel) = map.get(&id) {
            return Ok(tunnel.local_port);
        }
    }

    // 2. Bind local listener on a random port
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind local port: {}", e))?;
    let local_port = listener.local_addr().unwrap().port();

    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();

    // 3. Connect to SSH host with 10s timeout (validate credentials first)
    use std::net::ToSocketAddrs;
    let ssh_addr = format!("{}:{}", ssh_host, ssh_port);
    let mut addrs = ssh_addr.to_socket_addrs()
        .map_err(|e| format!("Failed to resolve SSH hostname {}: {}", ssh_host, e))?;
    let socket_addr = addrs.next()
        .ok_or_else(|| format!("Could not resolve SSH hostname {}", ssh_host))?;
    let tcp_conn = TcpStream::connect_timeout(&socket_addr, std::time::Duration::from_secs(10))
        .map_err(|e| format!("Failed to connect to SSH host {}: {}", ssh_addr, e))?;

    let mut sess = Session::new().map_err(|e| format!("Failed to create SSH session: {}", e))?;
    sess.set_tcp_stream(tcp_conn);
    sess.handshake().map_err(|e| format!("SSH Handshake failed: {}", e))?;

    // 4. Authenticate (validation check)
    if let Some(key_path) = ssh_key_path.clone().filter(|p| !p.trim().is_empty()) {
        sess.userauth_pubkey_file(
            &ssh_username,
            None,
            std::path::Path::new(&key_path),
            ssh_password.as_deref().filter(|p| !p.trim().is_empty()),
        )
        .map_err(|e| format!("SSH Key authentication failed for path {}: {}", key_path, e))?;
    } else if let Some(ref pass) = ssh_password {
        sess.userauth_password(&ssh_username, pass)
            .map_err(|e| format!("SSH Password authentication failed: {}", e))?;
    } else {
        return Err("No SSH Password or Keyfile provided".into());
    }

    if !sess.authenticated() {
        return Err("SSH Authentication failed".into());
    }

    // Disconnect the temporary validation session
    let _ = sess.disconnect(None, "Validation complete", None);

    // 5. Spawn background accept loop thread
    let running_loop = running.clone();
    let ssh_host_c = ssh_host.clone();
    let ssh_username_c = ssh_username.clone();
    let ssh_password_c = ssh_password.clone();
    let ssh_key_path_c = ssh_key_path.clone();
    let remote_db_host_c = remote_db_host.clone();

    thread::spawn(move || {
        for stream in listener.incoming() {
            if !running_loop.load(Ordering::Relaxed) {
                break;
            }

            if let Ok(local_stream) = stream {
                if !running_loop.load(Ordering::Relaxed) {
                    break;
                }

                let ssh_host = ssh_host_c.clone();
                let ssh_username = ssh_username_c.clone();
                let ssh_password = ssh_password_c.clone();
                let ssh_key_path = ssh_key_path_c.clone();
                let remote_db_host = remote_db_host_c.clone();
                
                thread::spawn(move || {
                    if let Err(e) = handle_single_connection(
                        local_stream,
                        ssh_host,
                        ssh_port,
                        ssh_username,
                        ssh_password,
                        ssh_key_path,
                        remote_db_host,
                        remote_db_port,
                    ) {
                        let _ = std::fs::write("ssh_error.log", format!("Connection handler failed: {}\n", e));
                        eprintln!("Connection handler failed: {}", e);
                    }
                });
            }
        }
    });

    // 6. Save in state map
    {
        let mut map = state.0.lock().unwrap();
        map.insert(
            id,
            TunnelInfo {
                local_port,
                running: running_clone,
            },
        );
    }

    Ok(local_port)
}

#[tauri::command]
pub fn stop_ssh_tunnel(
    state: tauri::State<'_, TunnelState>,
    id: u32,
) -> Result<(), String> {
    let tunnel = {
        let mut map = state.0.lock().unwrap();
        map.remove(&id)
    };

    if let Some(t) = tunnel {
        t.running.store(false, Ordering::Relaxed);
        // Wake up TcpListener's accept block by making a dummy connection
        let addr = format!("127.0.0.1:{}", t.local_port);
        let _ = TcpStream::connect(addr);
    }

    Ok(())
}
