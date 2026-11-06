# Frame 3 changes and fidelity boundaries

| Source or feature | Frame implementation | Verification scope |
|---|---|---|
| Supplied Orbit / paper-film references | Clean dark studio, editable continuous-film clock, single HTML export; original example retained | Existing timeline/export/clock regressions and offline browser playback |
| Chat director | Selected-model conversation, missing-detail questions, reviewable cast/story/shot proposals, interrupted-reply continuation | Real browser fixtures and strict canonical/project conflict checks |
| Casting | Shared code puppets, drawing strokes, image references, procedural 3D parts, imported models, placement into scenes | Identity-preserving edits, procedural geometry rendered in actual WebGL, GLB animation round trip |
| One-prompt production | Durable plan → cast → scenes → compositing → music → narration → assembly | Full app workflow with provider fixtures; cutoff/reload/provider handoff; partial/invalid outputs; current-edit conflicts; exact archive continuation |
| PulseForge source | Adapted pure composition, synthesis, kits, mixer, project schema and render modules; Frame UI and storage | Original source hashes unchanged; 30 pure producer/time parity cases; deliberate timing mutation rejected in 25 cases; all 14 instruments and 26 effects render finite nonzero audio in a browser |
| PulseForge features excluded | Sample libraries, original full UI/live engine/backend/account state | Explicit synth-only project imports and provenance; no claim to clone the full original app |
| Free neural speech | Kokoro with on-device ONNX inference and optional publisher phonemizer download; portable WAV | Actual inference, waveform checks, cached offline regeneration and phrase cancellation checkpoints |
| Provider/CLI expansion | Moonshot API, Codex, Claude Code, supported Z.AI plan route, Kimi Code, Grok Build, installed-tool inventory and trusted custom adapters | Real companion HTTP/process tests and UI fixtures; no live paid account entitlement claimed |
| Desktop/web parity | Shared TypeScript UI, Three.js, Rust timeline/WASM, Tauri/Rust companion | Production web/PWA, native signing/launch/export, portable archive checks; see final verification reports |

Reusable model geometry and code designs are shared exactly across scenes. External generative media may vary despite references. Keep original Blender/CAD/native authoring files; supported imports and GLB exchange do not replace every external studio feature.

Reforge evidence `verify` and `gate` passed for the limited pure producer/time parity scope. Original and candidate captures used the same dependencies and deterministic inputs, with an executed isolated timing mutation as the negative control. This does not establish whole-app, DSP, UI, account or performance equivalence. The broader release uses project-native unit, browser, Rust and packaging checks instead.

Independent review repaired actual defects in scene/cast overwrite races, backup alias mapping, duplicate work after interruption, atomic design/composite application, source-audio loop timing, deleted scene selection and mobile navigation. Remaining capability boundaries appear in VERIFICATION.md, ORCHESTRATION.md and provider-capabilities.md.
