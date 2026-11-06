# Frame 5 release verification — 2026-11-06

Current version: 5.0.0. Prior release reports are retained under `docs/history`; they are not substituted for these checks. Provider response fixtures do not establish live paid inference.

| Command / check | Result |
| --- | --- |
| `npm test` | PASS — 389 tests, 44 files. Includes actual Jolt, Chrome/WebKit particle and GPU rendering, export clock serialization, and trimmed AI revision tests. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | PASS. |
| `npm run test:e2e` | PASS — 27 local browser workflows, including bake/apply/export and split → interrupted generation → provider switch → apply. |
| `cargo test --manifest-path crates/film-core/Cargo.toml --locked` | PASS — 4. |
| `cargo test --manifest-path crates/film-storage/Cargo.toml --locked` | PASS — 3. |
| `cargo test --manifest-path companion/Cargo.toml --locked` | PASS — 19. |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked` | PASS — 4; 1 bundled lifecycle test intentionally ignored. Actual installed-app acceptance is separate. |
| `python3 -m unittest discover -s scripts/production -p 'test_*.py'` | PASS — 4. |
| `python3 -m unittest discover -s integrations/tests -p 'test_*.py'` | PASS — 5. |
| `npm audit --omit=dev` | PASS — zero reported vulnerabilities at check time; not a security guarantee. |
| Desktop/mobile UI inspection | PASS — 8 workspaces at 1440px and 393px, no page errors or document overflow; Chat icon center offset 0px in both axes. |
| Final example HTML in actual Chrome and WebKit, HTTP(S) blocked | PASS — seeks 4 → 0.75 → 6 → 4 seconds; 24 completed traced samples each frame; exactly repeated state for 62 objects, 60 particle snapshots and camera; zero requests/errors; embedded audio decodes. |
| Strict example pixel hash repeat | FAIL — six channels differ by at most 2/255 on each browser. Bounded numerical check PASS (maximum 2/255 across at most 32 channels). This is not a claim of universal bitwise GPU reproducibility. |
| `node tools/render-film.mjs ../Frame-5-example.frame.json ../Frame-5-example.mp4 --width 960 --height 540 --fps 12` | PASS — all 72 frames, 6 seconds, offline, 24 samples per frame, audible unclipped audio (peak 0.2378, RMS 0.0711). |

## Release publication gates

Final native acceptance, deployment, package integrity and repository publication are recorded here after their final gates complete.

## Failures resolved during verification

The first aggregate unit run returned 387 PASS / 2 FAIL during excessive concurrent browser workloads: a five-second IndexedDB fixture timeout and a transient iframe URL lookup. Vitest now uses two workers; the effects fixture selects the real iframe element. No timeout or rendering assertion was relaxed. Both focused files passed all 39 tests, then the complete current 389-test suite passed.

Cold Jolt fixture builds initially tried resolving a Node-only module branch in a browser IIFE. Test fixture bundling now externalizes `node:*`, matching the browser's inactive Node branch; the actual WASM solver remains in the browser tests. A source-time regression discovered during review was corrected: a trimmed 3D scene retains its original source duration and offset through manual and automatic AI revision. The regression exercises interrupted output and a provider handoff.

## What the new checks establish

Jolt settings are editable; physical motion is baked at a fixed 60 Hz into ordinary animation tracks. Cancellation does not commit a partial bake, changed inputs invalidate it, and restoring a bake preserves later manual edits. Export rejects unbaked/stale simulation. The portable film does not download Jolt.

Quarks uses independent saved seeds and fixed-time replay. Backward seeks, bounded cues, particles over traced meshes, and disposal are covered. Traced film frames await their sample budget; editor exploration remains rasterized. Reference captures use a completed film-camera render. GPU/shader failures are visible and do not silently substitute raster output.

Chat and editor headings use system sans typography. Orbital decoration and promotional empty-state copy were removed. Playback triangles receive an optical horizontal adjustment; pause icons stay centered. Authored film typography remains unchanged.

## Confirmed limits

Physics: explicit box/sphere colliders, up to 32 bodies and 30 seconds per bake; longer films use multiple shots. Particle cues: up to four emitters, 20 seconds emission plus a six-second lifetime tail. See [simulation workflow](FRAME-5-SIMULATION.md) for settings and bounds.

Path tracing uses the pinned WebGL implementation, not NVIDIA RTX/CUDA or the library's newer WebGPU API. Low sample counts can look grainy. Particles are depth-composited and do not contribute traced lighting, shadows or reflections; fog is not volumetrically traced.

Live paid provider inference, new ComfyUI model inference, WhisperX/CosyVoice model downloads, OBS/LosslessCut live control, physical iPhone, Intel/older macOS, and a full two-hour production/render: NOT RUN in this release. The app exposes the implemented integration boundaries. No OAuth credentials were extracted. Subscription CLI usage still requires the user's installed, signed-in supported tool.

Mac distribution is Apple Silicon and ad-hoc signed, not Apple-notarized. Browser and native project storage are local, not cloud synchronization. Code/asset and archive hashes detect mismatch; they do not certify provenance or security.
