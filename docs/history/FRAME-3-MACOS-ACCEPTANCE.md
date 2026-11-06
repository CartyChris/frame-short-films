# Frame 3.0 macOS acceptance

Checked November 6, 2026 on this Apple Silicon Mac. These results come from the actual Tauri/WebKit app copied from its DMG and operated through its native interface. A separate imported, crafted three-shot demo was used; previous app copies and projects were preserved. Provider account sign-in and paid inference were not exercised.

**Current gate: PASS for the checks below.** Three first-pass defects were corrected and retested: native music rendering, native speech caching, and direct seeking into later exported 3D scenes. Live paid providers and the explicitly listed untested platforms remain outside this gate. The final installer was recopied, signature-checked, launched, used to render music and create fresh exports; actual Kokoro synthesis and restart recovery were verified in the immediately preceding build with unchanged audio code.

| Result | Observed check |
| --- | --- |
| PASS | Rebuilt DMG checksum verifies and mounts read-only. App version is 3.0.0; executable is arm64. |
| PASS | `codesign --verify --deep --strict` succeeds for the mounted app and the local acceptance copy. It is ad-hoc signed, with no Team Identifier. |
| PASS | Actual app launches, retains previous films, and imports the demo as a separate project. The renamed acceptance film persists across quitting and relaunching. |
| PASS | Chat displays a clearly labelled local guide and places the user's message before its reply. Produce exposes the agent, length, animation, music, narration and checkpoint controls. Casting displays shared robot/fox designs and reference counts. No live AI conversation or automatic production was submitted in this native check. |
| PASS | Native 3D studio displays cast, scenery and shadows; playback visibly advances from 0.41 to 8.43 seconds with changing camera values. The Film workspace displays the final shot through its 30-second endpoint. |
| PASS | Native Sound renders the actual PulseForge cue to an 8.00-second WAV. **Save WAV** writes 1,411,244 bytes: stereo, 44,100 Hz, 16-bit PCM, measured nonzero peak 20,896. |
| PASS | Native **Local · free** narration generates “A little light travels a long way.” using Kokoro on this Mac. Its WAV is 121,244 bytes: mono, 24,000 Hz, 2.525 seconds, measured nonzero peak 15,494. No API key or paid fallback is used. |
| PASS | Local narration is attached to the film, and its completed phrase is separately saved as recovery audio. After quitting and relaunching, both score and narration remain on the timeline. |
| PASS | Native **Complete project** export produces valid `frame-project` JSON with three scenes, ten reusable models, two canonical characters, the editable soundtrack, two audio layers and three embedded WAV assets, including the speech checkpoint. The tested archive contains no `apiKey`, `bridgeToken` or fixture credential. |
| PASS | Native **Single-file HTML** writes the complete 30-second film into Frame's own exports folder. The first shot opens with all HTTP(S) requests blocked and visibly renders its 3D world. |
| PASS | Fresh final-native HTML exports open in Chrome with all HTTP(S) blocked. Direct seeks to 24 seconds and the 30-second endpoint both acknowledge controlled rendering, produce correctly sized 1177 × 662 canvases, and visibly show cast and scenery. Pixel checks find 188 and 176 quantized colors respectively, with no page errors. |
| PASS | Native **Start local companion** launches the bundled binary and scans installed Claude Code, Codex, Grok Build, Kimi Code and the Claude-based Z.ai route. Their sign-in state is explicitly unchecked. Quitting Frame stops its bundled companion. |
| NOT RUN | Live subscription/API inference, provider authentication, video generation, external Blender/Tripo generation, or a two-hour native render. Local-tool inventory does not establish provider entitlement. |
| NOT RUN | Physical microphone recording, Intel builds, older macOS versions, or a disconnected-network native speech run. Browser offline speech is covered separately in release verification. |
| NOT RUN | Apple Developer ID signing, notarization or App Store distribution. No distribution identity was supplied. |

## Exact build and installation location

The rebuilt installer tested above is `Frame_3.0.0_aarch64.dmg`, 11,220,181 bytes, SHA-256:

```text
81127409c98e9a3ffc75ae7312c130d792b57229548de8885802c6e6240c8d16
```

The mounted DMG app passes strict signature verification. Copying it to `work/frame-3/native-installed/Frame.app` in this Mac's iCloud-backed Documents folder adds `com.apple.FinderInfo`; FileProvider immediately recreates that metadata after removal, and strict verification of that copy fails. No source code, signature or quarantine attribute was changed. A second copy made with `ditto --norsrc --noextattr` at `/private/tmp/frame-3-native-final/Frame.app` passes strict verification and is the app used for the successful native retests. Initial copies remain preserved.

This is an ad-hoc signed build, not a notarized Developer ID release. Minimum configured macOS is 12.0; compatibility with that older system was not tested.

## Export and recovery evidence

Native exports are saved under `~/Library/Application Support/studio.frame.shortfilms/exports`; filenames have unique suffixes and existing files are not replaced. The narrated project checked here is `Frame-3-native-acceptance.frame-1793983745209-47591-1.json` (2,242,746 bytes). Its corresponding portable film is `Frame-3-native-acceptance-1793983737180-47591-0.html` (2,787,939 bytes). The native-rendered music file is `A small light  film theme-1793983177095-44667-0.wav`.

Two first-pass audio defects were resolved before the successful retest: native `connect-src` lacked `blob:` for Tone's offline audio support, and CacheStorage rejected the `tauri://` speech runtime key. The rebuilt app permits the required blob connection and caches native resources under a synthetic HTTPS key while fetching their original bundled URL. Empty native audio errors now have visible fallback text.

The late-scene export defect came from a child iframe initially reporting a zero-sized viewport, which created a 1 × 1 canvas and invalid camera aspect. The final runtime measures the laid-out viewport before rendering, observes later size changes and clamps dimensions. The final native export was checked from fresh browser loads at both 24 seconds and the endpoint; both screenshots were visually inspected.

Generated film iframes remain opaque-origin sandboxes without native capabilities. Native export and backup commands remain restricted to Frame's own directories. See [desktop setup](DESKTOP.md), [sound provenance](../src/lib/sound/PROVENANCE.md), and [release verification](VERIFICATION.md) for separate automated results and capability limits.
