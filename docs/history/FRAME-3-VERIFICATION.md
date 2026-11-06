# Frame 3.0 release verification

Checked November 6, 2026 against this source and https://frame-short-films.vercel.app. Provider fixtures test transport/state behavior; they do not establish live account entitlement. The crafted example uses deterministic fixture direction and real local rendering, not a paid live model.

| Result | Exact command or acceptance check | Observed scope |
|---|---|---|
| PASS | `npm test` | 293 tests, 28 files. Includes actual browser tests, durable generation, canonical cast, scene conflicts, interrupted plans/scenes, restored aliases, compositing, score schemas, speech/download integrity and provider adapters. |
| PASS | `node node_modules/typescript/bin/tsc --noEmit --pretty false` | TypeScript; final production builds also type-check. |
| PASS | `npm run build` | Shared Three runtime, TypeScript and Vite production build. Final native and Vercel builds include the speech download adapter. |
| PASS | `npm run test:e2e -- e2e/studio.spec.ts e2e/media-race.spec.ts e2e/reference-images.spec.ts e2e/three-studio.spec.ts` | 13 existing editor workflows, including actual reference resize/transport, 3D interchange, two-hour timeline/plan, late-response preservation and cutoff/provider switch. |
| PASS | `npm run test:e2e -- e2e/sound-studio.spec.ts e2e/production-pipeline.spec.ts` | 7 workflows: actual instruments/effects render, score editing/recovery, main one-prompt production, interrupted plan/provider handoff, offline export and independent project restore. |
| PASS | `FRAME_TEST_URL=https://frame-short-films.vercel.app npx playwright test e2e/studio.spec.ts e2e/media-race.spec.ts e2e/three-studio.spec.ts e2e/production-pipeline.spec.ts` | 13 complete workflows against the final production deployment, including new casting/3D/music production and responsive layouts. Provider responses are fixtures. |
| PASS | `node tools/check-pwa.mjs` | Final hosted app reloads offline, retains the project/cast, reproduces and animates the 3D frame. Chat, Produce, Casting and Sound open offline. Runtime/WASM cached; no API requests cached. |
| PASS | `node node_modules/playwright/cli.js test e2e/sound-native-csp.spec.ts --workers=1` | 2 WebKit checks using the actual native CSP: non-silent score render; intentionally blocked worklet produces a visible failure and preserves source. |
| PASS | `node --check public/sw.js` | Service-worker syntax. Final namespace: `frame-public-shell-v3-export`. |
| PASS | `npm audit --omit=dev --audit-level=high` | Zero reported production dependency vulnerabilities; not a security guarantee. |
| PASS | `cargo test --manifest-path crates/film-core/Cargo.toml --locked` | 4 timeline/checksum/boundary tests, including long timelines. |
| PASS | `cargo test --manifest-path crates/film-storage/Cargo.toml --locked` | 3 durable native storage checks. |
| PASS | `cargo test --manifest-path companion/Cargo.toml` | 16 tests, including real reviewed custom subprocesses, atomic profiles, literal args, Unicode, interrupted output and MCP guard/protocol checks. |
| PASS | `cargo test --manifest-path src-tauri/Cargo.toml --lib` | 4 native export/proxy/lifecycle-parser checks; separate bundled-process test is explicitly ignored by default. |
| PASS | `python3 -m unittest discover -s integrations/tests -p 'test_*.py'` | 5 Blender exchange archive/coordinate checks. |
| PASS | `VITE_API_ORIGIN=https://frame-short-films.vercel.app npm run desktop:build` | Rust companion, Rust/WASM, shared frontend, ad-hoc signed Apple Silicon app and DMG, version 3.0.0. |
| PASS | `vercel deploy --yes --prod --scope cloud-ops-game-time` | Final web build/deployment ready and aliased to the live app. |
| PASS | `node tools/render-film.mjs ../Frame-3-example.frame.json ../Frame-3-example.mp4 --width 1280 --height 720 --fps 24` | 30.000 seconds, 720/720 frames, H.264/AAC, embedded real PulseForge cue, no network. Entire video decodes and audio RMS is 0.067434. |
| PASS | Actual local speech acceptance, isolated production worker | Fresh-cache download plus real Kokoro WAV: 124,844 bytes / 2.6 seconds / RMS 0.06796. Fresh worker offline repeats identical metrics. Cancellation retains 94,844 bytes / 1.975 seconds. |
| PASS | Final worker module-graph assertion | No `node_modules/phonemizer` modules in the distributed worker; local pinned-download adapter present. Optional publisher code is fetched only on speech use, verified before loading and cached. |
| PASS | Limited Reforge `evidence.py verify` and `evidence.py gate` | 30 original-repeat and original/adapted pure producer/time cases exactly match. Executed isolated timing mutation rejected in 25 cases. Not whole-app/DSP/UI parity. |

PASS: the final native installer launches, renders music, preserves actual local narration across restart, and exports correctly rendered late/endpoint scenes. Native installation/launch/export and WebKit speech results are recorded separately in [MACOS-ACCEPTANCE.md](MACOS-ACCEPTANCE.md). Final ZIP integrity and checksums are recorded in the release note delivered beside the downloads.

## Review and repaired failures

Independent checks reproduced and repaired: native WebKit audio worklets blocked by missing blob permission; native speech Cache API rejecting non-HTTP app resources; empty WebKit error messages leaving no visible failure; a portable 3D child initializing at 1x1 / aspect 0 before layout, now resynchronized before frame acknowledgement; a late scene result overwriting a newer manual edit; design continuation missing intervening cast changes; backup ID remapping invalidating unchanged scene fingerprints or raw asset references; duplicate design/composite application across a crash boundary; restoration losing the applied plan's queue link; source music tails introducing a gap when looped; completed assembly retaining a deleted selected scene; and phone navigation overflowing the page.

Full-suite checks initially encountered selectors that assumed one file input and one Character name control. New mounted studios make those assumptions invalid. The checks now identify the intended import control and visible Story controls. The PWA check initially used the Story label for a Casting field; it now selects the actual Cast character name control. All affected checks were rerun and passed. No assertion was removed to conceal a product failure.

## NOT RUN / explicit limits

- Live paid text/image/video/speech and subscription inference: no account credentials or entitlement were supplied for this acceptance. Installed-tool discovery is distinct from authentication. Z.AI Coding Plan uses the documented supported Claude Code route. Gemini/Qwen/OpenCode have inventory/custom-profile support, not untested native protocol adapters.
- Live external Blender/MCP/Tripo production: required applications/accounts are not available. Local protocol/geometry exchange tests do not establish access to those external tools.
- A complete two-hour generated movie/MP4 render, physical iPhone/PWA installation, Textastic/Documents playback, and microphone hardware recording. Two-hour shot plans, seeking and portable exports are tested.
- Apple Developer ID/notarization, Intel/older macOS acceptance, and GitHub-hosted workflow execution. The shipped Apple Silicon app is ad-hoc signed; CI recipes are included.

Keep Frame open for unattended production. Closing preserves delivered code and completed assets but stops the client runner; reopening allows Resume. Browser storage can be cleared, so portable backups remain important. Shared geometry is identical across shots; generative image/video/code identity and story consistency are model-dependent. Native master Blender/CAD formats need source-tool conversion where Frame's importers do not support them.

Vite reports non-fatal chunk-size and mixed static/dynamic import notes; Zod emits removable annotation notes. The actual final builds and browser checks pass. The test-only IIFE harness emits an `import.meta` note; deployed code uses Vite's normal module build.
