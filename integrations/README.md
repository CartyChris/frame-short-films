# Studio integrations

Frame's **Studios** workspace provides three different capabilities. Their connection and verification states are deliberately separate.

## Blender exchange

Export a selected 3D shot as a `.frame3d.zip`: actual baked GLB geometry and animation, a bounded camera/lens curve, a versioned manifest, and the optional local add-on. Trimmed shots use their source offset and rebase the exported animation to zero. Use the bundled [Blender guide](blender/README.md) to install the add-on yourself and return the edited scene.

The return scene becomes one Frame model, preserving supported mesh hierarchy, rig and animation data. It does not reconstruct the original procedural controls. Keep `.blend` or CAD masters. Blender is not installed by this app. The add-on performs no network requests and never executes code found in an exchange archive. It reads two fixed archive entries without extracting paths, bounds their decompressed size, and adds objects without clearing the existing scene.

## Local MCP

The native app bundles a Rust companion. In the web/PWA version, run that companion on the same Mac; a Vercel function cannot launch a local desktop application. The companion listens only on `127.0.0.1:4319`, requires a random per-process bearer token, and accepts only configured exact browser origins. Add your deployed web origin to `FRAME_ALLOWED_ORIGINS` before starting it. Never use a wildcard. The native app's Start local companion button supplies its allowed Tauri origins automatically.

The app can initialize and discover a local Streamable HTTP MCP server, or directly start a preinstalled `mcp-for-blender` / `blender-mcp` executable. It never invokes a shell, accepts an arbitrary executable, installs a package, or uses `uvx` to fetch one. For the Blender community server, configure its Blender add-on first and start the add-on on loopback port 9876. See its [upstream repository](https://github.com/ahujasid/mcp-for-blender). This is a third-party project, not an official Blender Foundation service.

HTTP endpoints must be explicit loopback HTTP ports 1024–65535 (excluding the companion's port). Redirects and environment proxies are disabled. HTTP tokens and session IDs stay in process memory. JSON and SSE responses are bounded to 16 MiB; subprocess messages are newline JSON. Server-initiated sampling and client actions are unsupported. The companion negotiates initialize/initialized, supports paginated tools/list, and permits tools/call only for a discovered name and explicit reviewed arguments. Repeated call IDs are rejected. Tool calls are never selected by an LLM or automatically retried.

`Tool server connected` means initialization and tools/list succeeded. It does **not** establish that Blender is running, that a specific tool works, or that provider credentials are valid. Each invocation records an opaque call ID, name, timestamp and outcome with the project. Arguments and full results are not silently persisted. A result can be saved explicitly. A timeout is `unknown`; the operation might still be running. Inspect the target app before repeating it. Leaving the panel disconnects idle sessions; an active changing operation is not cancelled merely by navigation. Companion exit stops its child processes.

API (all behind the companion's existing origin/auth guard):

- `GET /integrations/status` → installation presence in known locations; no login checks.
- `POST /integrations/mcp/connect` → `{transport:'http'|'blender-stdio', endpoint?, token?}`; returns `{connectionId,status:'connected',serverInfo,tools}`.
- `POST /integrations/mcp/tools` → `{connectionId}`; refreshes discovered tool definitions.
- `POST /integrations/mcp/call` → `{connectionId,name,arguments:{},requestId,approved:true}`; returns `{requestId,result}`.
- `POST /integrations/mcp/disconnect` → `{connectionId}`; stops the stdio child and removes the connection.

Tool descriptions, schemas and returned content are third-party data. The app displays them as text. A user-selected tool may edit files, run Python, access a service or incur a charge; review that exact action before pressing **Run this tool once**. No raw MCP tool route is exposed to AI film generation.

Protocol sources: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Tripo workflow

The Tripo tab is a guided official CLI workflow, not a paid-job API connector. It prepares an attributed, safely quoted dry-run command. The user installs and signs into the CLI separately, reviews the exact dry-run plan, costs and warnings, then explicitly chooses whether to run the same command in their terminal. Frame never installs, logs in, uploads or submits a paid job through this tab.

Import a dry-run JSON to inspect its actual plan. A missing price remains missing; no estimate is fabricated. Import `task.json` or a final JSON receipt to preserve generation and chain task IDs, outcome, file names and billed credits in the project archive. The parser selects only these fields; keys, prompts and full provider payloads are excluded. Task IDs produce a watch/download command so an interruption can be checked without resubmission. Import the downloaded GLB through the cast library. Receipt URLs are not automatically fetched. [Official CLI documentation](https://developers.tripo3d.ai/en/docs/cli).

## Rooms and CAD

The room planning kit records Function → Form → Runtime stages, procedural shell/opening decisions, asset budgets and paid-task identity. Approval fields start false. It does not generate a completed room or claim approval. Frame supports film rendering, not game physics or gameplay tests. CAD STEP/IGES needs tessellation in its authoring tool to GLB/OBJ/STL before import; native solids and engineering constraints are not editable in Frame.

## Verification

- PASS: TypeScript type check.
- PASS: 10 integration tests for archive validation, trimmed camera rebasing, sample bounds, safe dry-run quoting, exact receipt identity preservation and unknown states.
- PASS: 5 Python tests for fixed archive entries, duplicate/version/GLB rejection and Z-up → Y-up coordinates. The module loads without Blender for these pure checks.
- PASS: Rust companion tests include a real ephemeral HTTP MCP fixture for initialization, discovery, selected invocation and refused unreviewed/undiscovered calls.
- PASS: actual companion + browser + local MCP fixture workflow: pairing, discovery, zero calls before review, exactly one explicit call, result display and disconnect; no browser errors. `node integrations/tests/mcp-smoke.mjs` runs this against the local app without invoking a provider.
- PASS: real animated Frame exchange ZIP export and Frame re-import in Chrome: 12-second scene, 1.8 MB GLB, camera samples, add-on and guide; no import/browser errors. This is not a Blender application round trip.
- NOT RUN: live Blender add-on import/edit/export, because Blender is not installed on the development Mac.
- NOT RUN: live community Blender MCP, because its executable/add-on is not installed.
- NOT RUN: live Tripo login/generation/download, because the CLI is not installed and no paid request was authorized or submitted.

Run checks: `npx vitest run --config integrations/vitest.config.ts`, `python3 -B integrations/tests/test_blender_exchange.py`, `cargo test --manifest-path companion/Cargo.toml`. Pure checks and a fixture are not evidence of external studio availability.
