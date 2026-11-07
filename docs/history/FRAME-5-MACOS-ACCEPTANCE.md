# Frame 5.0 macOS acceptance

Checked November 6, 2026 on macOS 27.0 (26A5388g), Apple Silicon arm64, through the actual Tauri/WKWebView app. Existing projects, applications and exports were preserved. A separate **Frame 5 native acceptance** project was added. No paid inference or model installation was requested.

**Current gate: PASS for the native checks below, including the final installed release.** The initial candidate failed the native shader check; that failure is preserved in [its report](history/FRAME-5-INITIAL-CANDIDATE-MACOS-ACCEPTANCE.md). The corrected shader was tested against the same saved scene and settings on the same machine. Frame 4 evidence remains [historical](history/FRAME-4-MACOS-ACCEPTANCE.md).

| Result | Observed check |
| --- | --- |
| PASS | Corrected DMG checksum validates and mounts read-only. Mounted app, acceptance copy and installed app pass strict deep signature verification. App version is 5.0.0, arm64. |
| PASS | App launches and retains all six pre-existing library projects. A separately named acceptance film saves without replacing them. |
| PASS | Chat shows sans-serif headings and a centered bubble icon in a simple rounded square, without the previous orbit decoration. The 3D playback triangle is optically centered. |
| PASS | In native WKWebView, adding Lantern box physics, setting Y velocity to 4, baking 3 seconds and applying succeeds. The UI reports saved baked motion and offers original-motion restore. Exported source contains 181 keyframes at 60 Hz. |
| PASS | Default Three.quarks Fireflies can be enabled and remain visible during native raster playback. Camera movement and the animated cast render correctly. |
| PASS | The corrected shader compiles in actual WKWebView and the Film camera reaches **complete · 4/4 samples**. Seeking from 0 to 6 seconds produces a different traced composition and completes again. Playback advances; after reaching the end, the preview completes its sample budget. The initial candidate's Metal/ANGLE compiler error does not recur. |
| PASS | **Save reference frame** succeeds with tracing enabled and the 16-sample export setting. The exported project contains the resulting image; direct image inspection shows the traced scene and cast rather than a blank canvas or editor controls. Low sample counts visibly retain grain. |
| PASS | Native Complete project and Single-file HTML exports save unique files with tracing enabled. The parsed project retains two scenes totaling 22 seconds, seven assets including the reference, physics settings/bake metadata, 181 Lantern keys, and the enabled Fireflies emitter. |
| PASS | Quitting and relaunching retains the acceptance project and saved simulation settings. The installed app retains all previous library projects plus the acceptance project. |
| NOT RUN | Portable HTML playback in another app, native movie recording, and project reimport in this gate. Browser/MP4 release checks are separate. |
| NOT RUN | Paid model inference, external Blender/MCP/Tripo services, ComfyUI, audio synthesis, microphone recording, and long-film endurance in this native gate. |
| NOT RUN | Intel hardware, older macOS, iPhone, Developer ID signing, notarization, and App Store distribution. |

## Final installed artifact

`Frame-5-macOS-Apple-Silicon.dmg`: 12,422,529 bytes. SHA-256:

```text
a1a19520d4ca9a344494869ddbddf311a88c0a98ea5c6c05de4c2d157510732a
```

The full functional retest used corrected build `267a91cd254808d69e5d484108720c9749b14a10bf7d0f0a423bd0c20c2e21b7`. The final build above changes only the PWA cache key. It was mounted read-only at `/private/tmp/frame-5-dmg-release` and installed with `ditto --norsrc --noextattr`. The final installed app was launched again, restored the saved film, and visibly reached **complete · 4/4 samples** in Film camera. Final DMG checksum, mounted signature, installed signature and matching executable hashes were independently verified. This is an ad-hoc signed build, not notarized. Configured minimum macOS 12.0 was not tested.

The installed `/Applications/Frame.app` was upgraded from 1.0.0 to 5.0.0. Its executable hash matches the mounted app and strict verification passes. The original application is preserved at `~/Library/Application Support/Frame App Backups/Frame-1.0.0-before-5-2026-11-06.app`. User project storage was not moved or replaced.

## Native export evidence

The corrected-build files remain in `~/Library/Application Support/studio.frame.shortfilms/exports`:

- `Frame-5-native-acceptance.frame-1794003857687-4188-0.json`: 6,233,377 bytes; SHA-256 `7d580cf71c0260b141d879570d92243e62777936486b426e4a82d8f9f5bc69ec`.
- `Frame-5-native-acceptance-1794003859034-4188-1.html`: 1,299,994 bytes; SHA-256 `4f0c1ff44e43ddf2ca9f6ac46ab2ceb94a4113eb3f7598fd168b1042c6d1088b`.

These exports have tracing enabled at 16 final samples, 4 preview samples, 4 bounces and 0.5 render scale. Successful native file delivery is separate from playback on every external browser/device. The visual result remains sample- and hardware-dependent; this gate does not promise photoreal output.
