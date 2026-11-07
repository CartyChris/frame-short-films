# Frame 6 macOS acceptance

Checked November 6, 2026 on macOS 27.0 (26A5388g), Apple Silicon, using the actual Tauri/WKWebView application. Frame 5 evidence remains in [history](history/FRAME-5-MACOS-ACCEPTANCE.md).

| Result | Observed check |
| --- | --- |
| PASS | Final DMG SHA-256 `65cfdebee7719fb5b7cd28b74468a2d1b7cecf88dae85aeed30780bc288f061c`; `hdiutil verify` reported a valid checksum. Mounted read-only; both mounted app and an independently copied temporary app passed `codesign --verify --deep --strict`. Bundle version 6.0.0. |
| PASS | The final temporary app opened the existing `Frame 5 native acceptance` project. Its 3D scene rendered traced scenery and three characters, and playback advanced from 00:10.03 to 00:16.19 without the `renderComplete is not a function` error. |
| PASS | Undo and Redo controls were visible and disabled on the unedited project. The previously active project was reselected after the smoke test. Existing projects were not deleted or edited. |
| PASS | `/Applications/Frame.app` was already version 6.0.0 and byte-for-byte identical to the final verified copy when inspected (`diff -qr` exit 0); its executable SHA-256 matched (`a30051d55af19bff32cc4f708ca287a1b0e78aab401c028e5b9ed0d4476f287a`), and strict signature verification passed. The installed app launched and reopened the previously active project. It was not replaced during this acceptance. |
| NOT RUN | Native fresh-profile blank-start and an edit/undo/redo round trip. The native app uses the existing project store, so this smoke avoided altering project contents. Fresh-profile and editing checks are separately reported in browser verification. |
| NOT RUN | Paid provider inference, physical iPhone, Intel macOS, Apple notarization, and a complete two-hour production/render. |

The app is ad-hoc signed and not Apple-notarized. A pre-existing Frame 1.0 app backup remains in `~/Library/Application Support/Frame App Backups/Frame-1.0.0-before-5-2026-11-06.app`. No new app-bundle backup was created here because the installed app was already identical to the final build; the prior Frame 5 DMG remains in the release folder. No paid generation was performed.

Earlier Frame 6 candidate DMGs (`18f2236e1a7c8a8843b3bb86bd7c9c1df690e1136602c9d66ab147a3f9b95d4b` and `b100704614d8e1b0a4ad2f1c10a5a6cece64e9766cd5e4bf38d3181541557be5`) independently passed native 3D playback before later source changes and the final rebuild.
