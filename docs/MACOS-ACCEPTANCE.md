# Frame 4.0 macOS acceptance

Checked November 6, 2026 on macOS 27.0 (26A5388g), Apple Silicon arm64, using the actual Tauri/WKWebView app copied from the final DMG. The app was operated through its native interface. Existing applications, projects and exports were preserved; two separately named acceptance projects were added. No paid inference or model installation was requested.

**Current gate: PASS for the native checks below.** This gate covers the new Motion editor, cinematic 3D finish, caption imports, native companion, export and recovery. It does not imply every optional service is installed or authenticated. Earlier Frame 3 audio and speech evidence is retained separately in [the historical report](history/FRAME-3-MACOS-ACCEPTANCE.md); it is not presented as a new Frame 4 retest.

| Result | Observed check |
| --- | --- |
| PASS | Final DMG mounts read-only. Both its mounted app and the separate acceptance copy pass `codesign --verify --deep --strict`. App version is 4.0.0 and executable is arm64. |
| PASS | Final app launches normally and retains the existing project library. A new disposable film can be created and renamed without replacing previous films. |
| PASS | Motion's **Kinetic type** preset creates an editable 8-second scene with three animated text elements. Seeking to 4 seconds visibly shows all three title lines in WKWebView. |
| PASS | Splitting the Motion scene at 4 seconds produces two 4-second clips. Native **Save Motion JSON** and **Import Motion/Lottie** round-trip the second clip: its complete source remains 8 seconds and its source offset remains 4 seconds. The import visibly confirms restored clip timing. |
| PASS | Native 3D studio creates a 12-second scene with three characters and reusable scenery. Enabling **Cinematic finish**, choosing **Noir**, switching to **Film camera**, and seeking to 6 seconds visibly renders the grayscale world, cast, shadows and vignette. It is not a blank or missing WebGL canvas. |
| PASS | Native SRT import reviews two timed cues before application. Applying once creates ordinary text layers. Export inspection confirms a 9.5–10.5-second cue is split at the scene boundary into two 0.5-second layers; the 14.5–15.5-second cue becomes a 1-second layer at local time 0.5. Reapplication is disabled for that import. |
| PASS | **Start local companion** pairs the bundled sidecar through the native app. An actual installed-tools scan returns explicit “not found” results for Blender, Tripo CLI and Blender MCP on this machine. Quitting Frame stops both the desktop and companion processes. |
| PASS | The ComfyUI panel starts/pairs the native companion and reaches its local-service check. With no ComfyUI service running at port 8188, the UI reports “Could not reach local ComfyUI.” This is an honest unavailable status, not successful generation. |
| PASS | Native **Complete project** and **Single-file HTML** exports save distinct files in Frame's exports folder. The project contains five scenes totaling 34 seconds, editable Motion documents and offsets, enabled Noir postprocessing, the caption import and all three caption layers. A recursive archive inspection finds no connection/credential fields. |
| PASS | Restoring the complete project creates a separate library entry. The caption set retains its applied state. After renaming the restored copy, quitting and relaunching, its name, five-scene timeline and layer counts persist. Selecting the final 3D shot visibly renders its saved Noir finish in the normal Film preview. |
| NOT RUN | Live ComfyUI image/video generation, WhisperX transcription/alignment, CosyVoice inference, OBS recording, external Blender/Tripo/MCP scene operations, or paid provider inference. No heavy model runtime was installed for this native gate. |
| NOT RUN | A repeat of Kokoro synthesis, score rendering, physical microphone recording, the two-hour workflow, or native movie recording in this Frame 4 gate. Earlier audio evidence is explicitly historical; current browser/automated results are separate. |
| NOT RUN | Portable HTML playback in an external browser as part of this native gate. Export bytes and project contents were inspected; current browser/MP4 release checks are reported separately in [release verification](VERIFICATION.md). |
| NOT RUN | Intel hardware, older macOS versions, Apple Developer ID signing, notarization or App Store distribution. |

## Exact tested artifact

`Frame-4-macOS-Apple-Silicon.dmg` is **11,461,988 bytes**, SHA-256:

```text
ae94b15db82683f1878174e684991dda163a555343d3785917beda5451a6fbef
```

It was mounted read-only at `/private/tmp/frame-4-dmg-final`. The app was copied with `ditto --norsrc --noextattr` into the new `/private/tmp/frame-4-native-final/Frame.app` location and launched from there. The previous Frame 3 acceptance copy was quit normally and preserved. The copied Frame 4 app remains available; the last launch shows the recovered acceptance film.

This build is ad-hoc signed with no Team Identifier, not a notarized Developer ID release. Strict verification passed again after the UI tests. Minimum configured macOS is 12.0; that older system was not tested.

## Native export evidence

All exports below remain in `~/Library/Application Support/studio.frame.shortfilms/exports`. Frame creates unique filenames and did not overwrite earlier exports.

- Editable clipped Motion source: `A-little-motion-part-2.motion-1793994995684-73913-0.json`.
- Complete project: `Frame-4-native-acceptance.frame-1793995277294-73913-1.json`, 2,230,760 bytes.
- Portable film: `Frame-4-native-acceptance-1793995282735-73913-2.html`, 1,084,506 bytes, SHA-256 `41699a0abe932a1f40bdd446cdf5e3e4eba1c61c856a8723b699efc4eebb4c57`.

The two projects are **Frame 4 native acceptance** and **Frame 4 native restored**. The test used locally crafted animation and SRT content, not live AI output. The exported project was parsed directly and restored through the native file picker. In-app screenshots were visually inspected during the Motion seek, cinematic finish and restored Film-preview checks.

See [desktop setup](DESKTOP.md) and [release verification](VERIFICATION.md) for setup, separate automated results and remaining capability limits.
