# Frame 5.0 macOS acceptance

Checked November 6, 2026 on macOS 27.0 (26A5388g), Apple Silicon arm64, through the actual Tauri/WKWebView app. Existing projects, applications, and exports were preserved. A separate **Frame 5 native acceptance** project was added. No paid inference or model installation was requested.

**Current gate: FAIL — native GPU path tracing.** This report records the initial release candidate below. A corrected build requires a new native retest. Frame4 evidence remains in [the historical report](history/FRAME-4-MACOS-ACCEPTANCE.md).

| Result | Observed check |
| --- | --- |
| PASS | DMG checksum validates and mounts read-only. Mounted app and acceptance copy pass strict deep signature verification. Version5.0.0, arm64. |
| PASS | App launches and retains all six pre-existing library projects. A separately named acceptance film saves without replacing them. |
| PASS | Chat shows sans-serif headings and the centered bubble icon inside a simple rounded square, without the previous orbit decoration. 3D playback triangle is optically centered. |
| PASS | A default 3D shot is editable in native WKWebView. Adding Lantern box physics, setting Y velocity4, baking3seconds and applying succeeds. The UI reports saved baked motion with original-motion restore available. Exported source contains181 keyframes at60Hz. |
| PASS | Default Three.quarks Fireflies can be enabled and remain visible during native raster playback. Camera movement and the animated cast render correctly. |
| FAIL | Enabling GPU path tracing and switching to Film camera fails while compiling the shader on this machine. The UI reports a Metal/ANGLE `thread float` versus `__metal_generic float` reference incompatibility. Disabling tracing clears the error and restores raster playback. |
| PASS | With tracing disabled, native Complete project and Single-file HTML exports save unique files. The project retains two scenes totaling22seconds, six assets, physics settings/bake metadata,181 Lantern keys, and an enabled Fireflies emitter. |
| PASS | After quitting normally and relaunching, the acceptance project name and two-scene timeline persist. The 3D inspector retains the3second bake, saved-motion status, restore action, and enabled Fireflies. |
| NOT RUN | Corrected-build retest, native path-traced export or reference capture, portable HTML playback, actual movie recording, and project reimport in this candidate. Browser/export checks are separate. |
| NOT RUN | Paid model inference, external Blender/MCP/Tripo services, ComfyUI, audio synthesis, microphone recording, and long-film endurance in this native gate. |
| NOT RUN | Intel hardware, older macOS, iPhone, Developer ID signing, notarization, and App Store distribution. |

## Tested candidate

`Frame-5-macOS-Apple-Silicon.dmg`:12,422,054bytes. SHA256:

```text
3fdb1cb7a09bb8ca9e73790e3e5501b572842f1409b63fed097cfe92423af616
```

Mounted read-only at `/private/tmp/frame-5-dmg-final`; copied with `ditto --norsrc --noextattr` to `/private/tmp/frame-5-native-final/Frame.app`. The previous Frame4 app was quit normally and preserved. This is an ad-hoc signed build, not notarized. Configured minimum macOS12.0 was not tested.

`/Applications/Frame.app` remains version1.0.0 with the expected bundle identifier. Replacement is held until the tracing failure is resolved.

## Native export evidence

Files remain in `~/Library/Application Support/studio.frame.shortfilms/exports`:

- `Frame-5-native-acceptance.frame-1794003550865-800-0.json`:4,464,091bytes; SHA256 `5bd1f3925906d11086bed9b3395318d6540c043c7b399c7011c9c8b6118ca6bc`.
- `Frame-5-native-acceptance-1794003550967-800-1.html`:1,298,380bytes; SHA256 `ebabe107e9e0879e4638dda92acfb547bc061453bd0282eecb7b4ec94e01193d`.

These exports intentionally have tracing disabled after the compile failure. They are evidence for editable-source and native-file delivery, not successful native traced rendering.
