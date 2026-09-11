use crate::models::FileBase64;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::path::Path;

/// Refuse anything this big outright. GitLab caps a variable value at 10 000
/// characters, so a file over ~7.5 KB already cannot be stored — but a generous
/// ceiling keeps the error about GitLab's limit rather than about our own.
pub const MAX_ENCODABLE_BYTES: u64 = 8 * 1024 * 1024;

/// Read a file and encode it as standard Base64, ready to be pasted into a
/// CI/CD variable and decoded in a job with `base64 -d`.
pub fn encode_file_base64(path: &Path) -> Result<FileBase64, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Failed to read file at {}: {}", path.display(), e))?;

    if metadata.len() > MAX_ENCODABLE_BYTES {
        return Err(format!(
            "File is too large to encode: {} bytes (limit {})",
            metadata.len(),
            MAX_ENCODABLE_BYTES
        ));
    }

    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read file at {}: {}", path.display(), e))?;

    Ok(FileBase64 {
        file_name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        byte_size: metadata.len(),
        base64: STANDARD.encode(&bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(name);
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(bytes).unwrap();
        path
    }

    #[test]
    fn encodes_a_known_byte_sequence() {
        let path = write_temp("glaber_encode_test.bin", &[0x00, 0xff, 0x10]);
        let encoded = encode_file_base64(&path).unwrap();
        assert_eq!(encoded.base64, "AP8Q");
        assert_eq!(encoded.byte_size, 3);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn derives_the_file_name() {
        let path = write_temp("glaber_name_test.p12", b"hello");
        let encoded = encode_file_base64(&path).unwrap();
        assert_eq!(encoded.file_name, "glaber_name_test.p12");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn rejects_a_missing_file() {
        let path = std::env::temp_dir().join("glaber_does_not_exist.bin");
        let _ = std::fs::remove_file(&path);
        assert!(encode_file_base64(&path).is_err());
    }
}
