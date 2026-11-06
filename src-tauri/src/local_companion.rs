use serde::Serialize;
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};

#[derive(Clone, Serialize)]
pub struct CompanionConnection {
    pub url: String,
    pub token: String,
}

pub struct RunningCompanion {
    child: Child,
    connection: CompanionConnection,
}
impl Drop for RunningCompanion {
    fn drop(&mut self) {
        #[cfg(unix)]
        if matches!(self.child.try_wait(), Ok(None)) {
            // This child owns a new process group, so its running CLI also exits.
            unsafe {
                libc::kill(-(self.child.id() as i32), libc::SIGTERM);
            }
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[derive(Default)]
pub struct CompanionState {
    pub inner: Arc<Mutex<Option<RunningCompanion>>>,
}
impl CompanionState {
    pub fn stop(&self) {
        if let Ok(mut state) = self.inner.lock() {
            state.take();
        }
    }
}

fn read_connection(reader: impl BufRead) -> Result<CompanionConnection, String> {
    let mut expecting_token = false;
    for line in reader.lines().take(8) {
        let line = line.map_err(|_| "Could not read the local companion startup message")?;
        if expecting_token {
            if line.len() == 64 && line.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Ok(CompanionConnection {
                    url: "http://127.0.0.1:4319".into(),
                    token: line,
                });
            }
            return Err("The local companion returned an unexpected startup message".into());
        }
        expecting_token = line == "Paste this token into Frame → Connections → Local companion:";
    }
    Err("The local companion did not start. Another companion may already be using port 4319; use its existing token or close it first.".into())
}

pub fn start(
    state: &Mutex<Option<RunningCompanion>>,
    executable: PathBuf,
    home: Option<PathBuf>,
) -> Result<CompanionConnection, String> {
    let mut state = state
        .lock()
        .map_err(|_| "Local companion state is unavailable")?;
    if let Some(running) = state.as_mut() {
        if matches!(running.child.try_wait(), Ok(None)) {
            return Ok(running.connection.clone());
        }
    }
    state.take();
    if !executable.is_file() {
        return Err("The bundled companion is missing. Rebuild Frame or run the separate companion from Terminal.".into());
    }
    let mut command = Command::new(executable);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .env("FRAME_ALLOWED_ORIGINS", "tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://127.0.0.1:5173,http://localhost:5173")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    // Finder does not inherit a terminal's PATH. Include the usual signed-in CLI
    // install locations without reading any shell scripts or credential files.
    let mut paths: Vec<PathBuf> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
    if let Some(home) = home {
        paths.push(home.join(".local/bin"));
        paths.push(home.join(".cargo/bin"));
    }
    paths.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ]);
    if let Ok(path) = std::env::join_paths(paths) {
        command.env("PATH", path);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not launch the local companion: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Local companion startup channel is unavailable")?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(read_connection(BufReader::new(stdout)));
    });
    let connection = match receiver.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(connection)) => connection,
        result => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(match result {
                Ok(Err(error)) => error,
                _ => "The local companion took too long to start".into(),
            });
        }
    };
    *state = Some(RunningCompanion {
        child,
        connection: connection.clone(),
    });
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires the bundled companion and an unused localhost port 4319; never invokes a provider CLI"]
    fn bundled_companion_starts_reuses_and_stops() {
        use std::io::{Read, Write};
        use std::net::{TcpListener, TcpStream};
        let probe =
            TcpListener::bind("127.0.0.1:4319").expect("Port 4319 must be free for this check");
        drop(probe);
        let state = CompanionState::default();
        let executable =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/frame-companion");
        let first = start(&state.inner, executable.clone(), None).unwrap();
        let second = start(&state.inner, executable, None).unwrap();
        assert!(
            first.token == second.token,
            "Existing companion should be reused"
        );
        let mut connection = TcpStream::connect("127.0.0.1:4319").unwrap();
        connection
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        write!(connection,"GET /health HTTP/1.1\r\nHost: 127.0.0.1:4319\r\nOrigin: tauri://localhost\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",first.token).unwrap();
        let mut response = String::new();
        connection.read_to_string(&mut response).unwrap();
        assert!(
            response.starts_with("HTTP/1.1 200"),
            "Authenticated local health request failed"
        );
        state.stop();
        assert!(
            TcpStream::connect("127.0.0.1:4319").is_err(),
            "Companion should stop with its owner"
        );
    }
    #[test]
    fn startup_parser_accepts_only_a_token_after_the_expected_marker() {
        let token = "a".repeat(64);
        let lines = format!("Frame companion is listening at http://127.0.0.1:4319\nPaste this token into Frame → Connections → Local companion:\n{token}\n");
        assert_eq!(read_connection(lines.as_bytes()).unwrap().token, token);
        assert!(read_connection(b"unexpected output\n".as_slice()).is_err());
        assert!(read_connection(
            "Paste this token into Frame → Connections → Local companion:\nnot-a-token\n"
                .as_bytes()
        )
        .is_err());
    }
}
