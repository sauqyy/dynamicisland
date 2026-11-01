//! The campus files kept on disk (who verified with SSO UI, the SCELE account, the SLCM timetable)
//! hold a name, an NPM and a weekly schedule. On Windows they are encrypted with the user's own
//! Windows account (DPAPI), so a copied folder, a backup or a roaming profile is unreadable anywhere
//! else; on macOS the file is made readable by its owner only. A file from before this, still in
//! plain text, is read as it is and sealed the next time it is written.
use std::path::Path;

/// What a sealed file starts with, so an old plain one is told apart.
#[cfg(windows)]
const MAGIC: &[u8] = b"astra-sealed:1\n";

#[cfg(windows)]
fn protect(data: &[u8], seal: bool) -> Option<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};
    unsafe {
        let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
        let mut out = CRYPT_INTEGER_BLOB::default();
        let done = if seal {
            CryptProtectData(&input, PCWSTR::null(), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        } else {
            CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        };
        done.ok()?;
        let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out.pbData as _)));
        Some(bytes)
    }
}

pub fn write(path: &Path, text: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        let sealed = protect(text.as_bytes(), true).ok_or_else(|| "couldn't encrypt the file".to_string())?;
        return std::fs::write(path, [MAGIC, &sealed[..]].concat()).map_err(|e| e.to_string());
    }
    #[cfg(not(windows))]
    {
        use std::io::Write;
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(path).map_err(|e| e.to_string())?;
        // an older file keeps its old mode when reopened: made owner-only too
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        f.write_all(text.as_bytes()).map_err(|e| e.to_string())
    }
}

pub fn read(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    #[cfg(windows)]
    if let Some(sealed) = bytes.strip_prefix(MAGIC) {
        return String::from_utf8(protect(sealed, false)?).ok();
    }
    String::from_utf8(bytes).ok()
}
