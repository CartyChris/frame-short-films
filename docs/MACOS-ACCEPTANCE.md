# Frame 6 macOS acceptance

2026-11-06, macOS 27.0 (26A5388g), Apple Silicon. Current results apply to the first Frame 6 candidate only; a later rebuild is pending. Frame 5 evidence is retained in [history](history/FRAME-5-MACOS-ACCEPTANCE.md).

- PASS: Candidate DMG `18f2236e1a7c8a8843b3bb86bd7c9c1df690e1136602c9d66ab147a3f9b95d4b` passed `hdiutil verify`, mounted read-only, and both mounted and temporary-copy apps passed `codesign --verify --deep --strict`.
- PASS: The temporary app launched in the actual Tauri/WKWebView and displayed the previously saved projects. Opened the existing `Frame 5 native acceptance` project and its 3D shot: traced scenery and three animated characters rendered, without `renderComplete is not a function`. Playback advanced from 00:10.08 to 00:15.02.
- PASS: Undo and Redo controls were visible and disabled on the unedited project, as expected. The prior active project was reselected after the smoke test. No project was deleted or edited.
- NOT RUN: native fresh-profile blank-start and edit/undo/redo round trip. The native app uses the existing project store; browser fresh-profile checks are separate. No paid provider inference was run.
- NOT RUN: physical iPhone, Intel macOS, Apple notarization, and full two-hour production/render. The app is ad-hoc signed.

Final rebuilt installer validation remains pending.
