use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

static NEXT_EXPORT: AtomicU64 = AtomicU64::new(0);

pub fn safe_export_name(name: &str) -> Result<&str, String> {
    if name.is_empty()
        || name.len() > 180
        || name.trim() != name
        || name.starts_with('.')
        || name.ends_with('.')
        || name
            .chars()
            .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
    {
        return Err(
            "Use a filename of 1–180 bytes without path separators or reserved characters".into(),
        );
    }
    Ok(name)
}

/// Publishes a fully flushed file with an exclusive hard link, so readers never see
/// an incomplete export and an existing filename can never be overwritten.
pub fn write_export(directory: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let name = safe_export_name(name)?;
    fs::create_dir_all(directory).map_err(|e| format!("Could not create export folder: {e}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let sequence = NEXT_EXPORT.fetch_add(1, Ordering::Relaxed);
    let file = Path::new(name);
    let stem = file.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let extension = file
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{s}"))
        .unwrap_or_default();
    let suffix = format!("{stamp}-{}-{sequence}", std::process::id());
    let destination = directory.join(format!("{stem}-{suffix}{extension}"));
    let temporary = directory.join(format!(".frame-export-{suffix}.pending"));
    let result = (|| -> std::io::Result<()> {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        output.write_all(bytes)?;
        output.sync_all()?;
        drop(output);
        fs::hard_link(&temporary, &destination)?;
        fs::remove_file(&temporary)?;
        File::open(directory)?.sync_all()?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Could not finish export: {error}"));
    }
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filenames_cannot_escape_export_folder() {
        for name in [
            "",
            ".",
            "..",
            "../film.html",
            "/film.html",
            "folder/film.html",
            "folder\\film.html",
            ".hidden",
            "film\n.html",
            "film:html",
            " film.html",
        ] {
            assert!(safe_export_name(name).is_err(), "accepted {name:?}");
        }
        assert!(safe_export_name("My film — première.html").is_ok());
        assert!(safe_export_name("Film.frame.zip").is_ok());
    }
    #[test]
    fn exports_preserve_bytes_and_never_replace_an_earlier_export() {
        let root = tempfile::tempdir().unwrap();
        let one = write_export(root.path(), "Film.html", b"first\0exact\xff").unwrap();
        let two = write_export(root.path(), "Film.html", b"second").unwrap();
        assert_ne!(one, two);
        assert_eq!(fs::read(one).unwrap(), b"first\0exact\xff");
        assert_eq!(fs::read(two).unwrap(), b"second");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
    }
}
