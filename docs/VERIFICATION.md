# Frame 6 verification

The current app starts a new film with one empty shot. Sample scenes, 3D assets and Chat prompts require an explicit click. Existing projects are retained. Project and media removal uses recoverable on-device storage; removed 3D models stay available to shots that already use them. Removal does not permanently erase the stored bytes or free browser storage. Project history undo/redo lasts for the current editing session; portable backups and Recovery provide longer-term recovery.

| Check | Result |
| --- | --- |
| `npm test` | Final full suite in progress. Earlier run passed 402 assertions but failed three browser teardown hooks under simultaneous build and browser load; it is not counted as a pass. |
| `npx playwright test --max-failures=2` | PASS — 30/30 local end-to-end workflows, including blank start, undo/redo, autosave, media/film/model recovery, Chat production, physics and offline film export. |
| Screenshot rendering regression | PASS — actual browser installed an older worker with an incompatible runtime, then loaded the versioned runtime and rendered a nonblank WebGL frame. The screenshot's historical cache state was unavailable; version skew is the likely cause, not proven for that exact session. |
| Chat-driven production | PASS — test fixture covers questions, selected model, automatic production of three editable scenes, 30-second duration, reload and no duplicate pipeline. Edited content is preserved; an untouched starter gets a saved revision before replacement. Live paid model inference was not run. |
| Animation and transitions | PASS — deterministic repeat seeks and authored rig poses, real-browser fade/dissolve and backward seek. Dissolves hold the outgoing shot's final frame; simultaneous motion in both shots is not implemented. |
| Hosted PWA and production | PASS — final public deployment `dpl_61jtfu7fzLYGHaNmEmxSFXzLYhQC`; hosted fresh-profile recovery/model-removal checks (2/2), offline PWA reload, and byte-for-byte versioned Three runtime, legacy runtime, service worker and WASM checks. Chat production also passed hosted fixture workflows on the preceding deployment; actual paid inference was not run. |
| Native macOS and DMG | See `MACOS-ACCEPTANCE.md` for final results. |
| GitHub CI | Pending current source run. |

Frame 5 verification is preserved under `docs/history`. A portable project backup remains the way to move data between devices; browser storage is local and can be cleared by the browser or user. Keep backups for important work. macOS adds its own project backups. Live paid provider inference, actual iPhone hardware, Intel macOS, and a complete two-hour render were not tested. GPU tracing needs compatible WebGL2; if a GPU or shader is unsupported, the app displays an error. The Apple Silicon DMG is ad-hoc signed, not Apple-notarized.
