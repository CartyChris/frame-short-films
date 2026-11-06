# Provider and local CLI capabilities

Checked against official documentation and the installed CLIs on 6 November 2026. These are connection capabilities, not a claim that every account, subscription, or model is available. Each user authenticates with and pays their own provider. Frame does not extract browser cookies, OAuth tokens, keychain entries, or credential files.

## What Frame implements

| Connection | Actual transport | Account/billing | Limits and controls |
|---|---|---|---|
| OpenAI, Anthropic, OpenRouter, Venice, xAI, Z.AI regular API, DeepSeek, Gemini API, Groq, Mistral, Together, Fireworks, custom HTTPS endpoint | Hosted API proxy; streaming text and live model catalog | User API key; provider API billing | Existing provider/media routes retained. A consumer subscription is not treated as a generic API key. |
| Kimi / Moonshot API | `https://api.moonshot.ai/v1`, OpenAI-compatible chat completions and live `/models` | Kimi API platform key | New named preset; streaming text uses the same durable journal. Sampling temperature is omitted because model restrictions vary. |
| Codex · ChatGPT | Installed Codex CLI, stdin, native JSON events | CLI-owned ChatGPT login or supported API authentication | Read-only execution policy, shell/image tools disabled, web search disabled, user configuration ignored, ephemeral session. Existing controls preserved. |
| Claude Code | Installed Claude Code, stdin, partial stream JSON | CLI-owned subscription or supported API authentication | Empty tools list, safe mode, no session persistence, no Chrome or slash commands. `--bare` is deliberately absent because it disables OAuth. |
| Z.AI Coding Plan | Installed Claude Code, same protected invocation | User-supplied Coding Plan key, or matching inherited process environment | Per-process `ANTHROPIC_AUTH_TOKEN` and documented Anthropic endpoint. No global config edits. Regular API billing remains a separate preset. |
| Kimi Code | Installed Kimi Code, headless JSON output | Its own `kimi login` session/model configuration | Temporary custom agent has `tools: []` and `subagents: []`; empty skills directory. Prompt is an argument, capped at 96 KiB without truncation. Machine-readable output is buffered inside Kimi until a message flushes. |
| Grok Build | Installed official Grok Build, private temporary prompt file, partial Messages JSON | Its own `grok login` session or supported API authentication | No auto-update, empty built-in tool list, no subagents/web search, one turn, `dontAsk`. Rejects an init event that reports enabled tools. Temporary request file is deleted with the process working directory. |
| Trusted custom CLI | User-reviewed absolute executable and fixed arguments; conversation through stdin | Whatever authentication the chosen tool legitimately supports | No shell interpolation; explicit registration required. Frame NDJSON or plain UTF-8 output. Plain output is forwarded in chunks without waiting for a newline. Successful exit is its completion signal. |
| Gemini CLI, Qwen Code, OpenCode | Installation discovery only | Authentication unchecked | No built-in invocation is claimed. A reviewed wrapper/profile must emit Frame NDJSON or plain text. Their native headless/ACP formats are documented upstream but are not silently assumed interchangeable. |

Kimi and Grok retain their own user configuration, hooks and possible session storage. Output-only model tool restrictions do not mean the installed executable or user-installed hooks have no OS permissions. This is stated in Connections. The app never installs a CLI, starts a login, changes global account settings, or grants generated content a CLI registration capability.

## Discover, connect, and preserve output

Connections → any local tool → **Scan local tools** checks fixed executable locations and PATH. On macOS this includes normal user-local, Homebrew, Kimi, Grok, OpenCode and NVM installation locations. Discovery checks files; it does not execute tools or inspect account credentials. Results say **Installed / Not installed** and **Sign-in unchecked**, separately from whether Frame has an adapter. **Add installed connections** explicitly creates connections for the available adapters; it does not authenticate or generate.

The companion listens only on `127.0.0.1:4319`. Every non-preflight request requires its process-lifetime bearer token and an exact allowed Origin. The browser UI only sends pairing tokens to a loopback companion address. Default origins cover local development and Tauri; a hosted deployment must be explicitly allowlisted in `FRAME_ALLOWED_ORIGINS`.

Built-in JSON events become `{type:"delta",text}`, `{type:"done",finishReason}`, or `{type:"error",message}`. The app commits every delivered delta before displaying it. Unexpected EOF, malformed JSON, CLI failure and token limits preserve delivered text and produce an interruption. Processes stop on client disconnect or the one-hour limit. Events are bounded at 16 MiB.

**Boundary:** Frame can preserve only bytes the upstream tool actually emits. Kimi 2.2's `PromptJsonWriter` buffers assistant deltas until flush; killing that CLI before flush can lose text still inside it. For continuously journaled larger requests, use the Kimi / Moonshot API route. No adapter claims to recover untransmitted provider output.

## Trusted custom CLI contract

The guarded API exposes:

- `GET /health`: companion pairing health plus installation inventory; account authentication remains `unchecked`.
- `GET /cli/profiles`: saved, credential-free profiles.
- `POST /cli/profiles`: `{profile:{id,name,executable,args,output},reviewed:true}`.
- `POST /cli/profiles/remove`: `{id}`.
- `POST /generate`: existing `{provider,model,messages,apiKey?}`; a custom provider is `cli:<profile-id>`. `apiKey` is accepted locally only for Z.AI Coding Plan.

Profiles use a 1–40 character lowercase/digit/dash ID, an absolute executable path, at most 64 fixed arguments, and `output: "frame-ndjson" | "text"`. A complete argument equal to `{model}` is substituted as one argument. `{prompt}` substitution, shell executables and shell launchers are rejected. Credentials must not be placed in arguments. Registering a profile does not run it. Profiles are saved atomically in the app's Application Support directory on macOS; the profile file contains no prompts or provider keys. Selecting a profile executes it with the user's normal permissions, so it must be trusted.

A Frame NDJSON wrapper writes one JSON value per line:

```json
{"type":"delta","text":"first received text"}
{"type":"delta","text":"continued text"}
{"type":"done","finishReason":"stop"}
```

Use `finishReason:"length"` for token/context cutoff, or `{type:"error",message:"..."}` after any already-delivered text when an operation fails. A zero process exit without a `done` marker is still an interruption for this protocol. Plain-text mode instead requires a successful exit. Custom wrappers are user-supplied trusted software, not model-generated shell commands.

## Official sources and observed versions

- **Kimi API:** [current quickstart](https://platform.kimi.ai/docs/get-your-api-key) specifies the Moonshot API base and API-key integration. This is a separate route from consumer subscription authentication.
- **Kimi Code:** [CLI reference](https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html), [custom agents](https://moonshotai.github.io/kimi-code/en/customization/agents.html), [ACP](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp.html), [configuration overrides](https://moonshotai.github.io/kimi-code/en/configuration/overrides.html). Installed `kimi --version`: **2.2.0**. Verified root/ACP help. [Official ACP entrypoint source](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-code/src/cli/sub/acp.ts) does not forward root agent-file/model options, so Frame does not use ACP while claiming those restrictions. [Official print renderer](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-code/src/cli/prompt-render.ts) establishes the JSON buffering boundary.
- **Grok Build:** [headless integration](https://docs.x.ai/build/cli/headless-scripting), [CLI reference](https://docs.x.ai/build/cli/reference), [official shell implementation documentation](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/README.md), [Messages wire format](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/src/headless/reducer/messages/wire.rs). Installed **1.0.13**, verified help, prompt-file, partial-message flags and `--no-auto-update --help`. Grok Build has an official CLI login; Frame does not reuse Grok web-session cookies or assume every Grok/X plan includes Build access.
- **Codex:** installed **0.144.5**, verified `exec --help`. [Official authentication documentation](https://developers.openai.com/codex/auth/) documents CLI sign-in options. No copied OAuth token is needed for this adapter.
- **Claude Code:** installed **2.1.215**, verified help. [Headless operation](https://code.claude.com/docs/en/headless) and [integration/compliance guidance](https://code.claude.com/docs/en/legal-and-compliance) distinguish supported user authentication from reselling or intermediating usage. Frame invokes the user's unmodified installation; it does not bundle Claude Code or pay user usage.
- **Z.AI:** [Claude Code integration](https://docs.z.ai/devpack/tool/claude) documents `https://api.z.ai/api/anthropic`. [Current tool-integration scope](https://docs.z.ai/devpack/tool/others) explicitly limits Coding Plan benefits to listed supported environments. Consequently Frame has **no direct Coding Plan API preset**, despite the existence of a technically compatible coding endpoint.
- **Other discovered CLIs:** [Gemini headless reference](https://geminicli.com/docs/cli/headless/), [Qwen headless reference](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/), [OpenCode CLI reference](https://opencode.ai/docs/cli/). These primary pages were fetched; their presence does not establish a tested Frame native adapter.

No upstream code or branding assets were vendored for these adapters. Protocol implementations use the documented wire shapes.

## Verification for this change

| Gate | Result |
|---|---|
| Companion tests, including actual temporary custom subprocess, Unicode/literal arguments, missing completion, atomic profile storage, guard and bounded event tests | PASS — `cargo test --manifest-path companion/Cargo.toml`, 16 tests, including text delivery before a newline and split UTF-8 preservation |
| Kimi API URL/body/catalog and subscription boundary tests; interrupted SSE retains text | PASS — `tests/provider-expansion.test.ts`, 4 tests |
| Local speech contract regressions alongside provider tests | PASS — `tests/local-speech.test.ts`, 8 tests |
| Actual Chrome Connections UI: scan → review/save profile → add connection (HTTP fixtures; no page errors) | PASS |
| Installed CLI flag/version inspection | PASS — the four versions above; no account file or credential extraction |
| Paid/live generation through Kimi, Grok, Codex, Claude or Z.AI in this expansion | NOT RUN — no paid inference was needed for protocol/registry verification; account/model access remains unchecked |
| Full app/native release validation | Parent release workflow; not claimed by these targeted checks |

Local CLI connections work on the computer running the loopback companion. The phone PWA can use API connections and local studios, but cannot remotely reach a Mac’s loopback CLI endpoint. No unattended remote relay or account-token synchronization is claimed.
