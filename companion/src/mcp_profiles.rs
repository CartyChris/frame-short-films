//! Explicitly reviewed, local MCP server launch profiles. This module never starts a process.
use super::cli;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

const MAX_PROFILES: usize = 32;
const MAX_FILE_BYTES: u64 = 128 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Profile {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub args: Vec<String>,
    pub revision: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProfileInput {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub args: Vec<String>,
}

pub(crate) struct Registry {
    path: Option<PathBuf>,
    profiles: Mutex<Vec<Profile>>,
    load_error: Option<String>,
}

impl Default for Registry {
    fn default() -> Self {
        let path = std::env::var_os("HOME").map(|home| {
            #[cfg(target_os = "macos")]
            let dir =
                PathBuf::from(home).join("Library/Application Support/studio.frame.shortfilms");
            #[cfg(not(target_os = "macos"))]
            let dir = PathBuf::from(home).join(".local/share/studio.frame.shortfilms");
            dir.join("mcp-profiles.json")
        });
        Self::load(path)
    }
}

fn validate_fields(id: &str, name: &str, executable: &str, args: &[String]) -> Result<(), String> {
    cli::validate_profile(&cli::Profile {
        id: id.to_string(),
        name: name.to_string(),
        executable: executable.to_string(),
        args: args.to_vec(),
        output: "text".into(),
    })
}

fn validate_saved(profile: &Profile) -> Result<(), String> {
    validate_fields(
        &profile.id,
        &profile.name,
        &profile.executable,
        &profile.args,
    )?;
    let revision =
        uuid::Uuid::parse_str(&profile.revision).map_err(|_| "Invalid MCP profile revision")?;
    if revision.get_version_num() != 4 || profile.revision != revision.to_string() {
        return Err("Invalid MCP profile revision".into());
    }
    Ok(())
}

fn read_profiles(path: &Path) -> Result<Vec<Profile>, String> {
    use std::io::Read;
    let meta = match std::fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("Could not inspect MCP profiles".into()),
    };
    if !meta.file_type().is_file() || meta.len() > MAX_FILE_BYTES {
        return Err("MCP profiles must be a regular file smaller than 128 KiB".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o077 != 0 {
            return Err("MCP profile file must be private to this user".into());
        }
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|_| "Could not read MCP profiles")?
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read MCP profiles")?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("MCP profiles exceed 128 KiB".into());
    }
    let profiles: Vec<Profile> = serde_json::from_slice(&bytes)
        .map_err(|_| "MCP profiles are invalid; the file was preserved")?;
    if profiles.len() > MAX_PROFILES {
        return Err("Too many MCP profiles; the file was preserved".into());
    }
    let mut ids = std::collections::HashSet::new();
    for profile in &profiles {
        validate_saved(profile).map_err(|_| "MCP profiles are invalid; the file was preserved")?;
        if !ids.insert(&profile.id) {
            return Err("Duplicate MCP profile IDs; the file was preserved".into());
        }
    }
    Ok(profiles)
}

impl Registry {
    pub(crate) fn load(path: Option<PathBuf>) -> Self {
        let loaded = path
            .as_ref()
            .map(|p| read_profiles(p))
            .unwrap_or_else(|| Err("Cannot locate MCP profile storage".into()));
        let (profiles, load_error) = match loaded {
            Ok(profiles) => (profiles, None),
            Err(error) => (Vec::new(), Some(error)),
        };
        Self {
            path,
            profiles: Mutex::new(profiles),
            load_error,
        }
    }

    pub(crate) fn list(&self) -> Vec<Profile> {
        self.profiles
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub(crate) fn error(&self) -> Option<&str> {
        self.load_error.as_deref()
    }

    pub(crate) fn get(&self, id: &str) -> Option<Profile> {
        self.profiles
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .find(|p| p.id == id)
            .cloned()
    }

    pub(crate) fn save(&self, input: ProfileInput) -> Result<Profile, String> {
        if let Some(error) = &self.load_error {
            return Err(error.clone());
        }
        validate_fields(&input.id, &input.name, &input.executable, &input.args)?;
        let canonical = std::fs::canonicalize(&input.executable)
            .map_err(|_| "The selected MCP executable does not exist")?;
        if !cli::executable_file(&canonical) {
            return Err("The selected MCP executable is not a regular executable file".into());
        }
        let executable = canonical
            .to_str()
            .ok_or("The executable path is not valid UTF-8")?
            .to_string();
        validate_fields(&input.id, &input.name, &executable, &input.args)?;
        let profile = Profile {
            id: input.id,
            name: input.name,
            executable,
            args: input.args,
            revision: uuid::Uuid::new_v4().to_string(),
        };
        let mut lock = self
            .profiles
            .lock()
            .map_err(|_| "MCP profile registry is unavailable")?;
        let mut next = lock.clone();
        if let Some(old) = next.iter_mut().find(|p| p.id == profile.id) {
            *old = profile.clone();
        } else {
            if next.len() >= MAX_PROFILES {
                return Err("At most 32 MCP profiles are supported".into());
            }
            next.push(profile.clone());
        }
        self.persist(&next)?;
        *lock = next;
        Ok(profile)
    }

    pub(crate) fn remove(&self, id: &str) -> Result<(), String> {
        if let Some(error) = &self.load_error {
            return Err(error.clone());
        }
        let mut lock = self
            .profiles
            .lock()
            .map_err(|_| "MCP profile registry is unavailable")?;
        let next: Vec<Profile> = lock.iter().filter(|p| p.id != id).cloned().collect();
        self.persist(&next)?;
        *lock = next;
        Ok(())
    }

    fn persist(&self, profiles: &[Profile]) -> Result<(), String> {
        use std::io::Write;
        let path = self
            .path
            .as_ref()
            .ok_or("Cannot locate MCP profile storage")?;
        let directory = path.parent().ok_or("Invalid MCP profile directory")?;
        let bytes =
            serde_json::to_vec_pretty(profiles).map_err(|_| "Could not encode MCP profiles")?;
        if bytes.len() as u64 > MAX_FILE_BYTES {
            return Err("MCP profiles exceed 128 KiB".into());
        }
        std::fs::create_dir_all(directory).map_err(|_| "Could not create MCP profile directory")?;
        // Check the destination is not a symlink before replacing it; never truncate it in place.
        if let Ok(meta) = std::fs::symlink_metadata(path) {
            if !meta.file_type().is_file() {
                return Err("MCP profile destination is not a regular file".into());
            }
        }
        let mut file = tempfile::NamedTempFile::new_in(directory)
            .map_err(|_| "Could not save MCP profiles")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.as_file()
                .set_permissions(std::fs::Permissions::from_mode(0o600))
                .map_err(|_| "Could not protect MCP profiles")?;
        }
        file.write_all(&bytes)
            .and_then(|_| file.as_file().sync_all())
            .map_err(|_| "Could not write MCP profiles")?;
        file.persist(path)
            .map_err(|_| "Could not replace MCP profiles")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn executable(dir: &TempDir, name: &str) -> String {
        let path = dir.path().join(name);
        std::fs::write(&path, b"test fixture").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        path.to_str().unwrap().to_string()
    }
    fn input(path: String) -> ProfileInput {
        ProfileInput {
            id: "cascadeur".into(),
            name: "Cascadeur local".into(),
            executable: path,
            args: vec!["--stdio".into()],
        }
    }
    #[test]
    fn registration_persists_private_profile_and_edit_changes_revision() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("profiles.json");
        let registry = Registry::load(Some(path.clone()));
        let exe = executable(&dir, "fixture-server");
        let first = registry.save(input(exe.clone())).unwrap();
        assert_eq!(
            first.executable,
            std::fs::canonicalize(&exe).unwrap().to_str().unwrap()
        );
        assert_eq!(registry.get("cascadeur"), Some(first.clone()));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        let reloaded = Registry::load(Some(path.clone()));
        assert_eq!(reloaded.list(), vec![first.clone()]);
        let second = reloaded.save(input(exe)).unwrap();
        assert_ne!(first.revision, second.revision);
        assert_eq!(
            Registry::load(Some(path.clone())).get("cascadeur"),
            Some(second)
        );
        reloaded.remove("cascadeur").unwrap();
        assert!(Registry::load(Some(path)).list().is_empty());
    }
    #[test]
    fn rejects_untrusted_shapes_and_missing_executables_without_writing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("profiles.json");
        let registry = Registry::load(Some(path.clone()));
        assert!(registry.save(input("relative".into())).is_err());
        assert!(registry
            .save(input(dir.path().join("missing").to_string_lossy().into()))
            .is_err());
        assert!(registry.save(input("/bin/sh".into())).is_err());
        let exe = executable(&dir, "server");
        let mut bad = input(exe.clone());
        bad.id = "Bad ID".into();
        assert!(registry.save(bad).is_err());
        let mut bad = input(exe.clone());
        bad.args = vec!["--api-key=secret".into()];
        assert!(registry.save(bad).is_err());
        let mut bad = input(exe);
        bad.args = vec!["x".into(); 65];
        assert!(registry.save(bad).is_err());
        assert!(!path.exists());
    }
    #[test]
    fn preserves_invalid_existing_file_and_blocks_updates() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("profiles.json");
        std::fs::write(&path, b"broken").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        }
        let registry = Registry::load(Some(path.clone()));
        assert!(registry.save(input(executable(&dir, "server"))).is_err());
        assert!(registry.remove("anything").is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"broken");
    }
    #[test]
    fn caps_profile_count_without_losing_existing_profiles() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("profiles.json");
        let registry = Registry::load(Some(path.clone()));
        let exe = executable(&dir, "server");
        for index in 0..MAX_PROFILES {
            let mut profile = input(exe.clone());
            profile.id = format!("server-{index}");
            registry.save(profile).unwrap();
        }
        let previous = std::fs::read(&path).unwrap();
        let mut extra = input(exe);
        extra.id = "server-extra".into();
        assert!(registry.save(extra).is_err());
        assert_eq!(registry.list().len(), MAX_PROFILES);
        assert_eq!(std::fs::read(path).unwrap(), previous);
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_and_non_private_registry() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("target");
        std::fs::write(&target, b"[]").unwrap();
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o600)).unwrap();
        let link = dir.path().join("link");
        symlink(&target, &link).unwrap();
        let registry = Registry::load(Some(link));
        assert!(registry.remove("anything").is_err());
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o644)).unwrap();
        let registry = Registry::load(Some(target));
        assert!(registry.remove("anything").is_err());
    }
}
