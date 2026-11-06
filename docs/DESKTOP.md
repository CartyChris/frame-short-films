# Desktop, Rust core, and local CLI companion

Frame's browser editor and macOS app share the same React interface and film format. The browser remains usable without installing the desktop app or companion. The companion is only needed to use an already signed-in local coding CLI from the browser.

## Rust / WebAssembly animation core

The dependency-free `crates/film-core` library builds as both a native Rust library and a compact WebAssembly module. It supplies timeline lookup, smooth easing, and a non-cryptographic FNV-1a checksum. The browser uses the compiled module at `public/film_core.wasm`, with an equivalent JavaScript fallback when WASM is unavailable.

```sh
rustup target add wasm32-unknown-unknown
npm run wasm
```

`src/lib/wasm.ts` exports:

- `initCore(): Promise<boolean>` — initializes once, returning true when Rust/WASM loaded.
- `locateScene(durations: number[], time: number): {index: number, localTime: number}` — exact boundaries move to the next scene; the final frame is retained; no scenes returns index -1.
- `ease(t: number): number` — clamped smoothstep.
- `engineLabel: string` — live binding, either `Rust · WebAssembly` or `JavaScript fallback`.

A 10,000-scene timeline is covered by the core tests. The checksum detects accidental differences and is not a security or authenticity guarantee.

## Build the macOS app

Requires current Rust, Node.js, and Xcode Command Line Tools. The app uses Tauri 2 and the system WebKit renderer.

```sh
npm install
npm run desktop:dev
npm run desktop:build
```

To give a native build a hosted API default, set `VITE_API_ORIGIN=https://your-frame-app.vercel.app` for `npm run desktop:build`. The packaged build supplied here uses `https://frame-short-films.vercel.app`; the app's API-origin setting can override it. This is a public server address, not a credential.

The release command builds the companion, frontend, and WASM first, then creates the app and DMG under `src-tauri/target/release/bundle/`. It includes `src-tauri/resources/frame-companion` inside the app. Signing/notarization credentials are not supplied by this project. Public distribution normally uses your own Apple signing/notarization setup. The native shell includes a microphone usage description; macOS asks for permission when the user first chooses to record narration.

The native release profile leaves symbol stripping disabled: stripping proc-macro metadata caused dependency loading failures with the tested Rust 1.97/macOS 27 toolchain. This affects binary size, not the app's provider or storage behavior.

The app has one native-capable window. Generated preview frames do not receive a native capability. No generic filesystem or shell plugin is enabled.

Generated film HTML intentionally contains inline JavaScript/CSS. The native configuration therefore disables Tauri's automatic nonce/hash insertion for `script-src` and `style-src`, while retaining the explicit content policy. Otherwise those injected hashes override `unsafe-inline` and leave film previews blank. Both preview layers remain sandboxed without `allow-same-origin`; generated code is not part of the native-capable main document.

### Native exports

`save_export({name,base64})` writes decoded file bytes to **Frame’s app-data exports folder** and returns the absolute saved path. The command accepts a safe basename only, adds a timestamp and unique suffix, and never replaces an existing export. It flushes a temporary file before publishing it atomically. HTML, project packages, sounds, and video use the same command. Each export is limited to 512 MiB; split larger films into reels.

### Native backup API

All commands are invoked through `@tauri-apps/api/core` and apply only to the app's own backup directory, normally `~/Library/Application Support/studio.frame.shortfilms/backups/` on macOS.

```ts
const {invoke} = await import('@tauri-apps/api/core');
const saved = await invoke('save_project_backup', {
  projectId: project.id,
  source: JSON.stringify(projectPackage)
});
const backups = await invoke('list_project_backups', {projectId: project.id});
const exactSource = await invoke<string>('read_project_backup', {
  projectId: project.id,
  backupId: saved.id
});
```

`projectPackage` should contain the project, media, unfinished runs, and chunk journal. The native command stores the supplied string's exact UTF-8 bytes; it never parses, truncates, or reformats the source. Every save creates a new backup. It writes a new temporary file, flushes it, atomically renames it, and flushes the directory. Failed temporary files are not listed as completed backups. There is no automatic deletion. A single backup is limited to 512 MiB; split very large media projects into reels.

Metadata is `{id, projectId, bytes, createdAtMs}`. Identifiers accept ASCII letters, digits, hyphens, and underscores only. The commands cannot take arbitrary paths.

`native_core({durations,time})` returns `{index,localTime,eased}` using the same Rust code as the web build.

### Optional native HTTPS requests

`proxy_request({method,url,body,headers})` permits GET/POST to fixed HTTPS paths for OpenAI, Anthropic, OpenRouter, DeepSeek, Gemini, Z.ai, xAI, and ElevenLabs. No redirects, arbitrary destinations, cookies, or arbitrary headers are forwarded. Authentication headers are supplied by the frontend for that request and are not stored by Rust.

It returns `{status, body, bodyBase64, contentType}`. Text/JSON is in `body`; binary responses use `bodyBase64`. Requests are limited to 8 MiB and responses to 32 MiB. This command is non-streaming. Streaming generation uses the web API connection or local companion.

## Connect a signed-in coding CLI

In the native app, **Start local companion** calls `start_companion()`, which returns `{url,token}` for the bundled process and fills the local connection. Repeated calls reuse the same running process/token. The token exists in memory only; the native launcher does not print it. Quitting Frame stops this companion and its running CLI process group. The bundled process allows only the fixed native and development origins listed below. Browser/Vercel use can launch the separate binary with an explicit origin allowlist.

1. Install and sign in to **Codex CLI** or **Claude Code** using its own supported login flow.
2. Run `npm run companion` in this source folder.
3. Copy the randomly generated token printed once at startup into Frame's local companion connection. The URL is `http://127.0.0.1:4319`.
4. Leave the terminal open while using that connection. Restarting creates a new token.

For a standalone companion binary, run `cargo build --release --manifest-path companion/Cargo.toml --locked`, then launch `companion/target/release/frame-companion`. This binary needs no Node.js or Rust runtime after it has been built; the chosen signed-in provider CLI must still be installed. The manual macOS GitHub workflow includes this binary alongside the app and DMG.

The companion does not read, extract, copy, or refresh OAuth credentials. The installed CLI manages its own authentication. A Z.ai Coding Plan connection runs the installed Claude Code CLI with the user's explicitly supplied Coding Plan key; it does not impersonate another provider or bypass a plan restriction. Provider account/model access is checked by the CLI on generation, not by the companion health check.

For Z.ai, enter the Coding Plan key in the local connection. The companion passes it only to that child process as `ANTHROPIC_AUTH_TOKEN`, with the fixed official `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`. It does not edit global Claude settings. Because safe mode skips settings files, a key stored only in `~/.claude/settings.json` is insufficient. As an alternative, the companion may inherit `ANTHROPIC_AUTH_TOKEN` when its process environment also contains that exact Z.ai base URL. An absent or mismatched configuration returns a clear error before launching a CLI. This follows the [official Z.ai Claude Code setup](https://docs.z.ai/devpack/tool/claude).

The default exact-origin allowlist is:

- `http://127.0.0.1:5173`
- `http://localhost:5173`
- `tauri://localhost`
- `http://tauri.localhost`
- `https://tauri.localhost`

For a deployed Vercel app, explicitly include its exact origin:

```sh
FRAME_ALLOWED_ORIGINS='https://your-frame-app.vercel.app,http://127.0.0.1:5173,tauri://localhost' npm run companion
```

This replaces the default list. Wildcards are rejected. Browser private-network access rules may still require a browser permission prompt or prevent an HTTPS page from calling loopback; the desktop app or a localhost browser session is the fallback.

### Companion HTTP contract

Both routes require `Origin` from the allowlist and `Authorization: Bearer <startup-token>`. Unknown/missing origins return 403; missing/incorrect tokens return 401. Allowed preflight requests return explicit CORS and private-network headers. There is no public bind, cookie authentication, or arbitrary command endpoint.

- `GET /health`: `{ok,authenticated,version,providers:{codex:{installed},'claude-code':{installed},'zai-coding':{installed}},note}`. `authenticated` means the companion token is valid, not that a provider account was tested.
- `POST /generate`: `{provider:'codex'|'claude-code'|'zai-coding',model:string,apiKey?:string,messages:[{role:'system'|'user'|'assistant',content:string}]}`. `apiKey` is accepted only for `zai-coding`; other extra generation fields are ignored. The response is newline-delimited JSON.

```json
{"type":"delta","text":"received source"}
{"type":"done","finishReason":"stop"}
```

An interrupted/failed CLI emits `{"type":"error","message":"..."}` without deleting previously delivered deltas. The frontend's persistent chunk journal owns recovery and continuation. Closing a request terminates its child CLI process. One generation runs at a time; a second returns 429. The bridge limits each individual run to one hour, after which received output remains recoverable and a continuation can begin.

### CLI execution details

The bridge passes argument arrays directly to the installed executable, never through a shell. It uses an isolated temporary working directory and sends the conversation through stdin. Prompts and raw CLI output are not written to audit files.

Codex runs:

```text
codex exec --json --sandbox read-only --skip-git-repo-check --ignore-user-config --ephemeral --disable shell_tool --disable view_image --config 'web_search="disabled"' --color never [--model MODEL] -
```

Claude Code and the configured Z.ai Coding Plan run:

```text
claude -p --output-format stream-json --verbose --include-partial-messages --tools '' --safe-mode --no-session-persistence --no-chrome --disable-slash-commands [--model MODEL]
```

These flags were checked against the installed CLIs' `--help`. `--bare` is intentionally absent because its documented behavior disables OAuth/keychain authentication. No permission-bypass flags are used. Codex's JSON protocol may emit completed assistant messages rather than individual token deltas; Frame can preserve output only after the CLI makes it available to the companion. Claude's partial text events stream as received.

## Verification

```sh
cargo test --manifest-path crates/film-core/Cargo.toml
cargo test --manifest-path crates/film-storage/Cargo.toml
cargo test --manifest-path companion/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib bundled_companion_starts_reuses_and_stops -- --ignored
cargo build --manifest-path companion/Cargo.toml
python3 scripts/check-companion.py
npm exec vitest run tests/core.test.ts tests/core-wasm.test.ts
```

Tests cover exact timeline boundaries, final-frame retention, a long timeline, WASM ABI/fallback agreement, exact-byte backup round trips, history retention, traversal refusal, unfinished-file exclusion, origin/token rejection, preflight handling, provider-event deduplication, and fixed CLI argument construction. Tests do not make paid inference calls or assert that an existing provider subscription permits a particular model.

Implementation references: [Tauri Rust commands](https://v2.tauri.app/develop/calling-rust/), [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [Tokio child processes](https://docs.rs/tokio/latest/tokio/process/struct.Command.html), [Codex feature definitions](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs).

The Mac export location is `~/Library/Application Support/studio.frame.shortfilms/exports`. **Export film → Show exports folder** calls `open_exports_folder()` with no supplied path; the native command opens only that fixed directory in Finder. This uses the app’s own storage and does not modify macOS privacy settings. Backups remain separate.
