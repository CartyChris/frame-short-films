//! Durable native backups. Saves are append-only and never re-serialize source bytes.
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
const MAX_BACKUP: usize = 512 * 1024 * 1024;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub project_id: String,
    pub bytes: u64,
    pub created_at_ms: u128,
}
fn safe_id(id: &str) -> io::Result<()> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Invalid project or backup identifier",
        ));
    }
    Ok(())
}
fn directory(root: &Path, project_id: &str) -> io::Result<PathBuf> {
    safe_id(project_id)?;
    Ok(root.join(project_id))
}
pub fn save_backup(root: &Path, project_id: &str, source: &[u8]) -> io::Result<BackupInfo> {
    if source.len() > MAX_BACKUP {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Backup exceeds 512 MiB; split this project into reels",
        ));
    }
    let dir = directory(root, project_id)?;
    fs::create_dir_all(&dir)?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?;
    let id = format!(
        "{}-{}-{}",
        now.as_millis(),
        now.subsec_nanos(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let temporary = dir.join(format!(".{id}.pending"));
    let destination = dir.join(format!("{id}.frame.json"));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(source)?;
        file.sync_all()?;
        fs::rename(&temporary, &destination)?;
        File::open(&dir)?.sync_all()?;
        Ok::<_, io::Error>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result?;
    Ok(BackupInfo {
        id,
        project_id: project_id.into(),
        bytes: source.len() as u64,
        created_at_ms: now.as_millis(),
    })
}
pub fn list_backups(root: &Path, project_id: &str) -> io::Result<Vec<BackupInfo>> {
    let dir = directory(root, project_id)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(id) = name.strip_suffix(".frame.json") else {
            continue;
        };
        if safe_id(id).is_err() {
            continue;
        }
        let Some(created_at_ms) = id.split('-').next().and_then(|v| v.parse().ok()) else {
            continue;
        };
        result.push(BackupInfo {
            id: id.into(),
            project_id: project_id.into(),
            bytes: entry.metadata()?.len(),
            created_at_ms,
        });
    }
    result.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms).then(b.id.cmp(&a.id)));
    Ok(result)
}
pub fn read_backup(root: &Path, project_id: &str, backup_id: &str) -> io::Result<Vec<u8>> {
    safe_id(backup_id)?;
    fs::read(directory(root, project_id)?.join(format!("{backup_id}.frame.json")))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_exact_bytes_and_retains_history() {
        let root = tempfile::tempdir().unwrap();
        let original = b"{\n  \"code\": \"<script>partial\\n\"\n}\n";
        let first = save_backup(root.path(), "project-1", original).unwrap();
        save_backup(root.path(), "project-1", b"different").unwrap();
        assert_eq!(
            read_backup(root.path(), "project-1", &first.id).unwrap(),
            original
        );
        assert_eq!(list_backups(root.path(), "project-1").unwrap().len(), 2);
    }
    #[test]
    fn refuses_path_traversal() {
        let root = tempfile::tempdir().unwrap();
        assert!(save_backup(root.path(), "../../escape", b"data").is_err());
        assert!(read_backup(root.path(), "valid", "../../escape").is_err());
    }
    #[test]
    fn ignores_uncommitted_temp_file() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("valid")).unwrap();
        fs::write(root.path().join("valid/.unfinished.pending"), b"partial").unwrap();
        assert!(list_backups(root.path(), "valid").unwrap().is_empty());
    }
}
