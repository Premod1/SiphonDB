use std::fs;
use rand::RngCore;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use tauri::Manager;

pub struct EncryptionKey(pub [u8; 32]);

pub fn init_encryption_key(app_handle: &tauri::AppHandle) -> Result<[u8; 32], String> {
    let config_dir = app_handle.path().app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    
    // Ensure the config directory exists
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    let key_path = config_dir.join("siphondb.key");
    
    if key_path.exists() {
        let key_bytes = fs::read(&key_path)
            .map_err(|e| format!("Failed to read key file: {}", e))?;
        if key_bytes.len() != 32 {
            return Err("Invalid encryption key length in siphondb.key (must be 32 bytes)".to_string());
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);
        Ok(key)
    } else {
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        
        fs::write(&key_path, key)
            .map_err(|e| format!("Failed to write key file: {}", e))?;
            
        // On Unix, set permissions to 0600 (owner read/write only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = fs::metadata(&key_path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o600);
                let _ = fs::set_permissions(&key_path, perms);
            }
        }
        
        Ok(key)
    }
}

pub fn encrypt(key: &[u8; 32], plaintext: &str) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher initialization failed: {}", e))?;
        
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;
        
    // Combine nonce and ciphertext
    let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    
    let encoded = BASE64.encode(combined);
    Ok(format!("_enc_v1:{}", encoded))
}

pub fn decrypt(key: &[u8; 32], ciphertext: &str) -> Result<String, String> {
    if ciphertext.is_empty() {
        return Ok(String::new());
    }
    
    if !ciphertext.starts_with("_enc_v1:") {
        // Plaintext fallback (backward compatibility)
        return Ok(ciphertext.to_string());
    }
    
    let base64_data = &ciphertext["_enc_v1:".len()..];
    let decoded = BASE64.decode(base64_data)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
        
    if decoded.len() < 12 {
        return Err("Decryption failed: input data too short".to_string());
    }
    
    let (nonce_bytes, cipher_bytes) = decoded.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher initialization failed: {}", e))?;
        
    let decrypted_bytes = cipher.decrypt(nonce, cipher_bytes)
        .map_err(|e| format!("Decryption failed: {}", e))?;
        
    String::from_utf8(decrypted_bytes)
        .map_err(|e| format!("UTF-8 conversion failed: {}", e))
}
