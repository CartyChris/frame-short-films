# Frame 6 verification

The current app starts a new film with one empty shot. Sample scenes, 3D assets and Chat prompts require an explicit click. Existing projects are retained. Project and media removal uses recoverable on-device storage; removed 3D models stay available to shots that already use them. Removal does not permanently erase the stored bytes or free browser storage. Project history undo/redo lasts for the current editing session; portable backups and Recovery provide longer-term recovery.

| Check | Result |
| --- | --- |
| `npm test` | PASS — `npm test -- --maxWorkers=1`: 402 tests in 50 files. An earlier simultaneous build/browser run reported 401 passing assertions, one timed-out transition test and two timed-out hooks; the three affected files passed 8/8 in isolation before the full serial rerun. |
| `npx playwright test --max-failures=2` | PASS — 30/30 local end-to-end workflows, including blank start, undo/redo, autosave, media/film/model recovery, Chat production, physics and offline film export. |
| Screenshot rendering regression | PASS — actual browser installed an older worker with an incompatible runtime, then loaded the versioned runtime and rendered a nonblank WebGL frame. The screenshot's historical cache state was unavailable; version skew is the likely cause, not proven for that exact session. |
| Chat-driven production | PASS — test fixture covers questions, selected model, automatic production of three editable scenes, 30-second duration, reload and no duplicate pipeline. Edited content is preserved; an untouched starter gets a saved revision before replacement. Live paid model inference was not run. |
| Animation and transitions | PASS — deterministic repeat seeks and authored rig poses, real-browser fade/dissolve and backward seek. Dissolves hold the outgoing shot's final frame; simultaneous motion in both shots is not implemented. |
| Hosted PWA and production | PASS — final public deployment `dpl_61jtfu7fzLYGHaNmEmxSFXzLYhQC`; hosted fresh-profile recovery/model-removal checks (2/2), offline PWA reload, and byte-for-byte versioned Three runtime, legacy runtime, service worker and WASM checks. Chat production also passed hosted fixture workflows on the preceding deployment; actual paid inference was not run. |
| Native macOS and DMG | PASS — final DMG checksum and strict signatures; actual macOS WKWebView opened and played an existing traced 3D scene without the reported error. The installed app already matched the final DMG and reopened the existing project. See [native acceptance](MACOS-ACCEPTANCE.md) for exact scope and NOT RUN checks. |
| GitHub CI | The first Frame 6 GitHub run `42319961949` returned FAIL: 401 passed, one transition-browser fixture timed out waiting for every embedded frame to load. The fixture now waits for the parent document and then its explicit film/seek handshakes, retaining all assertions. The updated source has a new GitHub run pending. |

Frame 5 verification is preserved under `docs/history`. A portable project backup remains the way to move data between devices; browser storage is local and can be cleared by the browser or user. Keep backups for important work. macOS adds its own project backups. Live paid provider inference, actual iPhone hardware, Intel macOS, and a complete two-hour render were not tested. GPU tracing needs compatible WebGL2; if a GPU or shader is unsupported, the app displays an error. The Apple Silicon DMG is ad-hoc signed, not Apple-notarized.

## Resolved verification failures

The first full unit run exposed a changed shoulder offset in an existing procedural character wave; the original authored-pose behavior was restored, and the full suite now passes. The first end-to-end run used old fixtures that expected automatic example content; the two affected workflows were updated to explicitly open the examples and assert the new blank-start duration, then the complete 30-test suite passed. One intermediate macOS packaging attempt failed because a temporary disk image was busy; it was ejected and the final build succeeded.

A final change keeps a blank new 3D shot empty while honoring an explicitly selected environment; focused validation and the final rebuilt installer are being checked.
