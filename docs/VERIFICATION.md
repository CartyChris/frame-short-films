# Frame 5 release verification — 2026-11-06

Current version: 5.0.0. Prior release reports are retained under `docs/history`; they are not substituted for these checks. Provider response fixtures do not establish live paid inference.

| Command / check | Result |
| --- | --- |
| `npm test` | PASS — 392 tests, 45 files (after the native shader compatibility fix). Includes actual Jolt, Chrome/WebKit particle and GPU rendering, export clock serialization, and trimmed AI revision tests. |
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

- PASS: `vercel deploy --yes --prod --scope cloud-ops-game-time` — final production `dpl_HtDsb8S2bQmB1FWvd8AJjhPCDff7`, aliased to https://frame-short-films.vercel.app. Its `npm run build` completed successfully.
- PASS: `FRAME_TEST_URL=https://frame-short-films.vercel.app npx playwright test e2e/media-race.spec.ts e2e/production-pipeline.spec.ts e2e/production-tools.spec.ts e2e/studio.spec.ts e2e/three-studio.spec.ts e2e/physics.spec.ts e2e/three-revision.spec.ts` — all 17 deployed workflows, repeated successfully after the shader fix.
- PASS: separate fresh-context offline simulation — Jolt WASM chunk cached before first use; a new body was baked/applied offline; Quarks creation and seeking worked without page errors.
- PASS: `node tools/check-pwa.mjs` — hosted app reopens offline, retains project/cast, reproduces the 3D frame and animates Motion; Chat/Produce/Casting/Sound/Studios open offline; public runtimes/WASM cached and API excluded.
- PASS: deployed Three runtime, Motion runtime, Rust WASM and service worker bytes exactly match local public files.
- PASS: source pushed to the private [CartyChris/frame-short-films](https://github.com/CartyChris/frame-short-films) repository. Final implementation commit `2af41bf` includes the native shader fix and cache upgrade; its hosted CI is being checked separately.
- PASS: 323 implementation/configuration/test/asset hashes recorded in `RELEASE-SOURCE-SHA256.json`; release prose excluded so verification can be finalized without a circular hash.

Native functional acceptance PASS; final Apple Silicon DMG and installed `/Applications/Frame.app` verified at SHA-256 `a1a19520d4ca9a344494869ddbddf311a88c0a98ea5c6c05de4c2d157510732a`. After the shader fix: actual WKWebView completes traced frames, seeks, captures a reference image, exports HTML and a complete project, and retains physics/particles after restart. See the native report for the final artifact hash and installed-app check. Package integrity PASS: `python3 scripts/package-release.py` assembled 347 project files plus five deliverables; independent verification checks all 352 ZIP entries for CRC, unique safe paths and byte-for-byte agreement with source/artifacts. All 323 source-manifest entries match. Nine external release artifact hashes are verified. Packaging is repeated after final report updates.

PWA upgrade PASS: a controlled replay of the exact previous service-worker script established the old cache on the production origin. After removing that fixture, the real deployed update waited without changing the open editor/controller. Closing all app tabs then reopening activated only the new cache, including the patched runtime and Jolt chunk; offline reload and the 3D example passed. The first live-update harness used an unstable second registration lookup and failed its lifecycle observation; a stable reference corrected the harness. No application change was needed.

## Native shader compatibility

The first actual macOS 27.0 (26A5388g) run failed path-tracing shader compilation with an ANGLE/Metal thread-address-space error, despite newer automated WebKit passing. This matches the [WebKit out/inout compiler defect](https://github.com/WebKit/WebKit/commit/4d4a69df0d2109f7d125e634a24c5d58bcab930e). Frame now passes two affected struct-member calls through ordinary local variables and copies their results back. The adapter checks exact pinned shader anchors and fails visibly if a future dependency changes them. No system browser settings or OS files are modified. Three adapter regression tests and six actual Chrome/WebKit GPU tests pass; the final native retest is reported in [MACOS-ACCEPTANCE.md](MACOS-ACCEPTANCE.md).

## Failures resolved during verification

The first aggregate unit run returned 387 PASS / 2 FAIL during excessive concurrent browser workloads: a five-second IndexedDB fixture timeout and a transient iframe URL lookup. Vitest now uses two workers; the effects fixture selects the real iframe element. No timeout or rendering assertion was relaxed. Both focused files passed all 39 tests, then the complete current 389-test suite passed.

Cold Jolt fixture builds initially tried resolving a Node-only module branch in a browser IIFE. Test fixture bundling now externalizes `node:*`, matching the browser's inactive Node branch; the actual WASM solver remains in the browser tests. A source-time regression discovered during review was corrected: a trimmed 3D scene retains its original source duration and offset through manual and automatic AI revision. The regression exercises interrupted output and a provider handoff.

## GitHub runner verification

The initial Linux CI run [42303576055](https://github.com/CartyChris/frame-short-films/actions/runs/42303576055) returned FAIL: 380 passed, 9 failed. Chromium render tests exceeded existing deadlines; two GPU cases took 106.7 and 69.6 seconds while corresponding WebKit cases completed in 5.7 and 2.7 seconds. Rust, Python, Jolt and Quarks gates passed. The runner did not record its original graphics backend, so a specific driver cause is not claimed. The second run [42305153088](https://github.com/CartyChris/frame-short-films/actions/runs/42305153088) recorded SwiftShader for both default and explicit backends: 386 PASS / 6 FAIL. All path-tracing checks passed, including the application's 60-second frame deadline. The remaining failures were whole-test 10/20/30-second guards across the older browser workflow fixtures.

CI now runs one worker, with a bounded 120-second whole-test allowance in only those two browser fixture files. Every image/state assertion and all application scene/frame deadlines remain unchanged; ordinary local test budgets remain unchanged. A focused `CI=true CHROME_PATH=... npx vitest run tests/three-browser.test.ts tests/three-effects-browser.test.ts --maxWorkers=1` passed all 13 tests locally. Final Linux rerun is pending.

## What the new checks establish

Jolt settings are editable; physical motion is baked at a fixed 60 Hz into ordinary animation tracks. Cancellation does not commit a partial bake, changed inputs invalidate it, and restoring a bake preserves later manual edits. Export rejects unbaked/stale simulation. The portable film does not download Jolt.

Quarks uses independent saved seeds and fixed-time replay. Backward seeks, bounded cues, particles over traced meshes, and disposal are covered. Traced film frames await their sample budget; editor exploration remains rasterized. Reference captures use a completed film-camera render. GPU/shader failures are visible and do not silently substitute raster output.

Chat and editor headings use system sans typography. Orbital decoration and promotional empty-state copy were removed. Playback triangles receive an optical horizontal adjustment; pause icons stay centered. Authored film typography remains unchanged.

## Confirmed limits

Physics: explicit box/sphere colliders, up to 32 bodies and 30 seconds per bake; longer films use multiple shots. Particle cues: up to four emitters, 20 seconds emission plus a six-second lifetime tail. See [simulation workflow](FRAME-5-SIMULATION.md) for settings and bounds.

Path tracing uses the pinned WebGL implementation, not NVIDIA RTX/CUDA or the library's newer WebGPU API. Low sample counts can look grainy. Particles are depth-composited and do not contribute traced lighting, shadows or reflections; fog is not volumetrically traced.

Live paid provider inference, new ComfyUI model inference, WhisperX/CosyVoice model downloads, OBS/LosslessCut live control, physical iPhone, Intel/older macOS, and a full two-hour production/render: NOT RUN in this release. The app exposes the implemented integration boundaries. No OAuth credentials were extracted. Subscription CLI usage still requires the user's installed, signed-in supported tool.

Mac distribution is Apple Silicon and ad-hoc signed, not Apple-notarized. Browser and native project storage are local, not cloud synchronization. Code/asset and archive hashes detect mismatch; they do not certify provenance or security.
