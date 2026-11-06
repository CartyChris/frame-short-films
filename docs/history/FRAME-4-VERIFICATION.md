# Frame 4 release verification — 2026-11-06

This report is for the current 4.0.0 source. Frame 3 results are retained under docs/history and are not substituted for current checks. Provider inference fixtures and local mock services are identified explicitly.

| Command / check | Current result |
| --- | --- |
| `npm test` | PASS — 348 tests, 35 files, including actual Chrome/WebKit render gates. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | PASS. |
| `npm run build` | PASS — both portable runtimes and the Vercel frontend. |
| `npm run test:e2e` (local Vite) | PASS — 25 browser checks. Earlier selectors were updated for the new Studios layout. |
| `cargo test --manifest-path crates/film-core/Cargo.toml --locked` | PASS — 4. |
| `cargo test --manifest-path crates/film-storage/Cargo.toml --locked` | PASS — 3. |
| `cargo test --manifest-path companion/Cargo.toml --locked` | PASS — 19, including real loopback ComfyUI fixture transport. |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked` | PASS — 4; 1 bundled lifecycle test intentionally ignored. Actual installed-app acceptance is separate. |
| `python3 -m unittest discover -s scripts/production -p 'test_*.py'` | PASS — 4 helper boundary/checkpoint checks. |
| `python3 -m unittest discover -s integrations/tests -p 'test_*.py'` | PASS — 5 Blender interchange checks. |
| `npm audit --omit=dev` | PASS — zero reported vulnerabilities at check time; not a security guarantee. |
| `VITE_API_ORIGIN=https://frame-short-films.vercel.app npm run desktop:build` | PASS — final 4.0.0 app and Apple Silicon DMG built from the current source. Actual native acceptance is recorded separately below. |
| Actual librosa 0.11.0 helper, synthetic 16s / 120 BPM PCM input | PASS — 31 beats, 31 onsets, 117.454 BPM estimate, 690 finite RMS samples, original SHA-256 unchanged. |
| `vercel deploy --yes --prod --scope cloud-ops-game-time` | PASS — production deployment `dpl_2TSzsM6MgmNyCx8hU7SaKMqPnz4U`, aliased to https://frame-short-films.vercel.app. |
| `FRAME_TEST_URL=https://frame-short-films.vercel.app npx playwright test e2e/media-race.spec.ts e2e/production-pipeline.spec.ts e2e/production-tools.spec.ts e2e/studio.spec.ts e2e/three-studio.spec.ts` | PASS — all 15 deployed-app workflows. Provider responses are fixtures, not paid inference. |
| `node tools/check-pwa.mjs` | PASS — actual hosted app reopens offline, retains cast/project, reproduces the 3D frame, animates Motion, opens all named studios, caches both runtimes/WASM and excludes API requests. |
| `node tools/render-film.mjs ../Frame-4-example.frame.json ../Frame-4-example.mp4 --width 1280 --height 720 --fps 24` | PASS — all 720 frames, 30 seconds, offline, H.264 1280×720 at 24 fps; AAC stereo at 48 kHz. Actual audio measured −26.4 dB mean / −16.1 dB peak. Sampled Motion/Lottie and 3D frames visually inspected. |
| Actual `Frame-4-example.html` in Chrome and WebKit, `file://`, HTTP(S) blocked | PASS — fresh seeks 24 → 30 → 14 → 2 → 4 → 24 → 2 seconds; correct scene/time acknowledgements, nonblank 3D, seven Motion objects/two Lottie shapes, identical repeated frames, changing motion, embedded WAV decodes; zero requests/page errors. |
| `python3 scripts/package-release.py ../Frame-4-Short-Films-AI-Harness.zip --dmg ../Frame-4-macOS-Apple-Silicon.dmg --example ../Frame-4-example.html --example-project ../Frame-4-example.frame.json --example-video ../Frame-4-example.mp4 --preview ../Frame-4-studio-preview.png` and independent archive verification | PASS — 313 source files plus five deliverables; CRC, unique safe paths and all 318 entries compared byte-for-byte with source/artifacts. Repeated after final documentation updates. |
| Release source manifest | PASS — all 166 entries in `RELEASE-SOURCE-SHA256.json` match the final implementation. |
| Deployed static bytes | PASS — hosted Motion runtime, Three runtime, Rust/WASM module and service worker exactly match the final local public files. |
| Actual final native acceptance | PASS — final DMG verifies/mounts; strict signatures pass; version 4.0.0 arm64. Actual WebKit Motion seek/split/source reopen, cinematic 3D, captions, companion pairing, native HTML/project exports, separate backup restoration and quit/relaunch persistence passed. See `MACOS-ACCEPTANCE.md` for exact scope. |

The first attempt to run the entire local browser suite against the hosted site returned **FAIL: 2 / PASS: 23**. Both failures attempted to import `/src/lib/*.ts`, which exists only in the Vite development server. The two source-module checks passed locally. The correct hosted command above passed all 15 deployed-app workflows; isolated component fixtures are not counted as hosted verification. README now gives the correct commands.

## What the tests establish

- Anime timelines and Lottie vectors evaluate from the film clock; arbitrary seeking, split source offsets and offline playback are checked in actual browsers. Fresh-document screenshot comparisons allow only a one-level RGB difference in at most 0.1% of pixels for Chrome edge antialiasing; object poses and opacity must match exactly.
- AI Motion output is journaled before display, continues after cutoff with another provider, remains separate from accepted source, and restores through an archive. Trimmed AI revisions retain source duration/offset. Imported vector artwork is resolved by stable identity instead of repeated in model context.
- 3D effects produce measurable pixel changes, preserve deterministic replay, use the editor/film camera correctly, resize their buffers, dispose resources and restore the ungraded path. Real file HTML tests cover fresh late-scene seeks, endpoint holds and embedded runtime portability.
- Caption imports create editable layers across scenes. Word timing never invents missing timestamps. Beat/cut operations preserve source media and animation timing. Invalid caption edits are rejected before persistence, so they cannot make a backup unrestorable.
- A real local HTTP fixture exercises the companion’s paired Origin/token check, loopback endpoints, workflow bounds, duplicate request rejection, saved remote ID, status, media download, and redirect rejection. This is transport verification, not live diffusion/model generation. The browser preserves an unknown submission through reload and checks status without another POST. Pairing tokens do not enter the project.

## Confirmed boundaries

Live ComfyUI model inference, WhisperX model inference/diarization, CosyVoice synthesis, OBS capture/control, LosslessCut live control, and paid provider inference: NOT RUN. The app labels the actual implemented workflows and does not imply these engines or models are installed. Remotion/Manim are external authoring handoffs; path tracing, Jolt physics and Quarks simulation are deferred. No original application source was blindly vendored.

Actual iPhone hardware, Intel macOS and older macOS releases: NOT RUN here. Desktop Chrome/WebKit and responsive phone layouts are checked. A full two-hour movie production/render is NOT RUN; long timeline planning and source-safe editing remain covered. Mac distribution is ad-hoc signed, not Apple-notarized. GitHub workflows are included; no GitHub-hosted workflow was run during this local release.

The build emits existing dependency-comment, mixed-import and large-chunk notices. These are not treated as proof of failure or as a reason to suppress functional tests. Source and artifact hashes detect accidental mismatch; they do not certify provenance or security.
