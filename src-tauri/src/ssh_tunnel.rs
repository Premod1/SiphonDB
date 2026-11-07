use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use ssh2::Session;

pub struct TunnelInfo {
    pub local_port: u16,
    pub running: Arc<AtomicBool>,
    pub session: Arc<Mutex<Session>>,
}

pub struct TunnelState(pub Mutex<HashMap<u32, TunnelInfo>>);

struct SshConfig {
    ssh_host: String,
    ssh_port: u16,
    ssh_username: String,
    ssh_password: Option<String>,
    ssh_key_path: Option<String>,
    remote_db_host: String,
    remote_db_port: u16,
}

fn connect_and_auth_ssh(config: &SshConfig) -> Result<Session, Box<dyn std::error::Error + Send + Sync>> {
    let ssh_addr = format!("{}:{}", config.ssh_host, config.ssh_port);
    let mut addrs = ssh_addr
        .to_socket_addrs()
        .map_err(|e| format!("Failed to resolve SSH hostname {}: {}", config.ssh_host, e))?;
    let socket_addr = addrs
        .next()
        .ok_or_else(|| format!("Could not resolve SSH hostname {}", config.ssh_host))?;
    let tcp_conn = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(10))
        .map_err(|e| format!("Failed to connect to SSH host {}: {}", ssh_addr, e))?;

    let mut sess = Session::new().map_err(|e| format!("Failed to create SSH session: {}", e))?;
    sess.set_tcp_stream(tcp_conn);
    sess.handshake()
        .map_err(|e| format!("SSH Handshake failed: {}", e))?;

    if let Some(key_path) = config.ssh_key_path.as_ref().filter(|p| !p.trim().is_empty()) {
        sess.userauth_pubkey_file(
            &config.ssh_username,
            None,
            std::path::Path::new(key_path),
            config.ssh_password.as_deref().filter(|p| !p.trim().is_empty()),
        )
        .map_err(|e| format!("SSH Key authentication failed for path {}: {}", key_path, e))?;
    } else if let Some(ref pass) = config.ssh_password {
        sess.userauth_password(&config.ssh_username, pass)
            .map_err(|e| format!("SSH Password authentication failed: {}", e))?;
    } else {
        return Err("No SSH Password or Keyfile provided".into());
    }

    if !sess.authenticated() {
        return Err("SSH Authentication failed".into());
    }

    // Set short session timeout (2 ms) so thread waiting on read yields session lock rapidly,
    // eliminating 50-100 ms query latency while multiplexing channels
    sess.set_timeout(2);
    // Keepalive every 15s to prevent idle disconnects from remote SSH daemon
    sess.set_keepalive(true, 15);

    Ok(sess)
}

// Helper function to bridge two TCP/channel streams bidirectionally with low latency
fn bridge_streams(mut a: TcpStream, mut b: ssh2::Channel, running: Arc<AtomicBool>) {
    let mut a_clone = match a.try_clone() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to clone local TCP stream: {}", e);
            return;
        }
    };
    let mut b_clone = b.clone();

    // 10 ms read timeout on local TCP stream to allow checking `running` status periodically
    let _ = a.set_read_timeout(Some(Duration::from_millis(10)));
    let _ = a_clone.set_read_timeout(Some(Duration::from_millis(10)));

    let running_worker = running.clone();

    // Spawn thread to copy from local DB client stream to remote SSH channel
    let writer_handle = thread::spawn(move || {
        let mut buffer = [0u8; 16384];
        while running_worker.load(Ordering::Relaxed) {
            match a_clone.read(&mut buffer) {
                Ok(0) => break, // EOF from local DB client
                Ok(n) => {
                    let mut offset = 0;
                    while offset < n && running_worker.load(Ordering::Relaxed) {
                        match b_clone.write(&buffer[offset..n]) {
                            Ok(0) => break,
                            Ok(w) => offset += w,
                            Err(ref e)
                                if e.kind() == std::io::ErrorKind::WouldBlock
                                    || e.kind() == std::io::ErrorKind::TimedOut =>
                            {
                                thread::yield_now();
                            }
                            Err(_) => break,
                        }
                    }
                    if offset < n {
                        break;
                    }
                }
                Err(ref e)
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut =>
                {
                    thread::yield_now();
                }
                Err(_) => break, // Socket closed or error
            }
        }
        let _ = b_clone.send_eof();
        let _ = b_clone.close();
    });

    // Copy from remote SSH channel to local DB client stream in this thread
    let mut buffer = [0u8; 16384];
    while running.load(Ordering::Relaxed) {
        match b.read(&mut buffer) {
            Ok(0) => break, // EOF from remote DB server
            Ok(n) => {
                if a.write_all(&buffer[..n]).is_err() {
                    break;
                }
            }
            Err(ref e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut
                    || e.to_string().to_lowercase().contains("timeout") =>
            {
                thread::yield_now();
            }
            Err(_) => break, // Connection closed or error
        }
    }

    let _ = a.shutdown(std::net::Shutdown::Both);
    let _ = b.close();
    let _ = writer_handle.join();
}

#[tauri::command(async)]
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
            if tunnel.running.load(Ordering::Relaxed) {
                return Ok(tunnel.local_port);
            }
        }
    }

    let config = Arc::new(SshConfig {
        ssh_host,
        ssh_port,
        ssh_username,
        ssh_password,
        ssh_key_path,
        remote_db_host,
        remote_db_port,
    });

    // 2. Connect to SSH host and authenticate once (shared session for all pooled connections)
    let sess = connect_and_auth_ssh(&config).map_err(|e| format!("{}", e))?;
    let sess_shared = Arc::new(Mutex::new(sess));

    // 3. Bind local listener on a random port
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind local port: {}", e))?;
    let local_port = listener.local_addr().unwrap().port();

    let running = Arc::new(AtomicBool::new(true));
    let running_loop = running.clone();

    // 4. Spawn background accept loop thread
    let sess_clone = sess_shared.clone();
    let config_clone = config.clone();

    thread::spawn(move || {
        for stream in listener.incoming() {
            if !running_loop.load(Ordering::Relaxed) {
                break;
            }

            if let Ok(local_stream) = stream {
                if !running_loop.load(Ordering::Relaxed) {
                    break;
                }

                let sess_holder = sess_clone.clone();
                let conf = config_clone.clone();
                let running_conn = running_loop.clone();

                thread::spawn(move || {
                    let channel_res = {
                        let sess = sess_holder.lock().unwrap();
                        sess.channel_direct_tcpip(&conf.remote_db_host, conf.remote_db_port, None)
                    };

                    let channel = match channel_res {
                        Ok(ch) => ch,
                        Err(e) => {
                            eprintln!("Failed to open direct-tcpip channel, trying reconnect: {}", e);
                            let mut sess_guard = sess_holder.lock().unwrap();
                            match connect_and_auth_ssh(&conf) {
                                Ok(new_sess) => {
                                    *sess_guard = new_sess;
                                    match sess_guard.channel_direct_tcpip(
                                        &conf.remote_db_host,
                                        conf.remote_db_port,
                                        None,
                                    ) {
                                        Ok(ch) => ch,
                                        Err(err2) => {
                                            eprintln!("Failed to open direct-tcpip channel after reconnect: {}", err2);
                                            return;
                                        }
                                    }
                                }
                                Err(err2) => {
                                    eprintln!("SSH Reconnect failed: {}", err2);
                                    return;
                                }
                            }
                        }
                    };

                    bridge_streams(local_stream, channel, running_conn);
                });
            }
        }
    });

    // 5. Save in state map
    {
        let mut map = state.0.lock().unwrap();
        map.insert(
            id,
            TunnelInfo {
                local_port,
                running,
                session: sess_shared,
            },
        );
    }

    Ok(local_port)
}

#[tauri::command(async)]
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
        if let Ok(sess) = t.session.lock() {
            let _ = sess.disconnect(None, "Tunnel stopped", None);
        }
        // Wake up TcpListener's accept block by making a dummy connection
        let addr = format!("127.0.0.1:{}", t.local_port);
        let _ = TcpStream::connect_timeout(
            &addr.parse().unwrap_or_else(|_| "127.0.0.1:0".parse().unwrap()),
            Duration::from_millis(50),
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tunnel_state_insert_and_remove() {
        let state = TunnelState(Mutex::new(HashMap::new()));
        let running = Arc::new(AtomicBool::new(true));

        // Create a dummy session for testing state map
        let sess = Session::new().unwrap();
        let session = Arc::new(Mutex::new(sess));

        {
            let mut map = state.0.lock().unwrap();
            map.insert(
                1,
                TunnelInfo {
                    local_port: 12345,
                    running: running.clone(),
                    session: session.clone(),
                },
            );
        }

        {
            let map = state.0.lock().unwrap();
            assert!(map.contains_key(&1));
            let info = map.get(&1).unwrap();
            assert_eq!(info.local_port, 12345);
            assert!(info.running.load(Ordering::Relaxed));
        }

        {
            let mut map = state.0.lock().unwrap();
            let removed = map.remove(&1);
            assert!(removed.is_some());
            assert!(!map.contains_key(&1));
        }
    }

    #[test]
    fn test_stop_ssh_tunnel_cleans_up_and_unblocks_listener() {
        let state = TunnelState(Mutex::new(HashMap::new()));
        let running = Arc::new(AtomicBool::new(true));

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let sess = Session::new().unwrap();
        let session = Arc::new(Mutex::new(sess));

        {
            let mut map = state.0.lock().unwrap();
            map.insert(
                42,
                TunnelInfo {
                    local_port: port,
                    running: running.clone(),
                    session,
                },
            );
        }

        let running_clone = running.clone();
        let handle = thread::spawn(move || {
            for stream in listener.incoming() {
                if !running_clone.load(Ordering::Relaxed) {
                    break;
                }
                let _ = stream;
            }
        });

        // Perform stop cleanup
        {
            let tunnel = {
                let mut map = state.0.lock().unwrap();
                map.remove(&42)
            };
            assert!(tunnel.is_some());
            let t = tunnel.unwrap();
            t.running.store(false, Ordering::Relaxed);
            let addr = format!("127.0.0.1:{}", t.local_port);
            let _ = TcpStream::connect_timeout(
                &addr.parse().unwrap(),
                Duration::from_millis(50),
            );
        }

        // Listener thread must cleanly exit and join
        handle.join().unwrap();
        assert!(!running.load(Ordering::Relaxed));
    }
}
