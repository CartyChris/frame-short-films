# Frame 5 — motion and simulation integrations

Frame shares one project clock across code, structured motion, 3D, footage, captions and sound. New tools contribute to that editable timeline. The in-app **Studios → Tool library** lists all 20 requested projects and distinguishes built-in features, local workflows, external handoffs and deferred integrations.

## Built-in motion and cinematic looks

**Motion** uses Anime.js 4.5.0 for editable shapes and typography. Object transforms and ordered keyframes are stored in the project. Preview, backward seeking, clip splitting, portable HTML and MP4 all evaluate the same time. Select **Editable motion graphics** in Produce, choose motion in a shot plan, or ask the Motion director for a scene. Received JSON is journaled before display and can continue with another model after a cutoff. Invalid output remains in Recovery.

Lottie-web 5.13.0 supplies vector animation playback in Motion. The first supported slice is vector shapes, solids, nulls and precompositions in JSON. Convert text to outlines and embed no external resources. Images, audio, expressions, external fonts and unsupported layers are rejected with an explanation; this is not a promise to play every After Effects export. The lightweight player excludes expression execution. Original supported JSON remains editable in the project; rendered playback follows the film clock.

**3D studio → cinematic effects** uses postprocessing 6.39.6, compatible with Three 0.187. Opt-in bloom, vignette, brightness, contrast, hue, saturation and exposure are saved in each ThreeDocument. Existing scenes without effects use the original rendering path. HTML and MP4 include the grade; ordinary GLB stores geometry/materials/animation and does not carry these screen-space effects. Blender exchange retains the Frame document alongside its baked GLB.

These library runtimes are bundled locally and embedded in portable HTML, with license notices. An exported film needs no CDN or account for these built-in features. Large vector compositions or 3D effects can still exceed a particular phone's GPU or memory capacity; start with a representative shot when targeting mobile.

## Production tools

**Studios → Production tools** imports timed captions from SRT, WebVTT and WhisperX JSON. Applying captions creates ordinary editable text layers, split correctly at scene boundaries. Unsupported style/position metadata is reported. Choose segment captions or WhisperX word captions. Untimed words are reported and skipped in word mode; use segment mode to retain the complete transcript. Timestamps are never fabricated.

An optional librosa helper produces beat/onset analysis JSON. Review suggested cuts and apply them to the film; source offsets and audio envelopes are retained. Analysis is not a claim that every beat is musically correct. LosslessCut seconds CSV and strict JSON project files provide cut ranges that can become new source-referencing clips. JSON5 should be exported as CSV first. The original media is preserved.

ComfyUI works through Frame's authenticated local companion and a loopback ComfyUI server. Import an **API-format** workflow, review it, then submit once. The saved workflow, requested identity and returned prompt identity permit later status checks. Unknown submission outcomes remain unknown and are not automatically re-submitted. Outputs are downloaded into the media library before use. Running workflows requires your installed nodes/models and can invoke services configured by those nodes; Frame does not install or audit third-party custom nodes.

The hosted PWA cannot directly run Python, Blender, FFmpeg or your Mac's CLI on an iPhone. File imports work on mobile. Live local workflows require the companion on the same computer; localhost on an iPhone refers to the phone, not your Mac. Keep local tooling paired only with origins you intend to use.

## Why every repository is not a dependency

- [Three.js](https://github.com/mrdoob/three.js), [Blender MCP](https://github.com/ahujasid/mcp-for-blender) and [FFmpeg](https://github.com/FFmpeg/FFmpeg) already have concrete roles in Frame: scene rendering, reviewed local tools/scene exchange, and full-composition MP4 delivery.
- [Anime.js](https://github.com/juliangarnier/anime), [Lottie](https://github.com/airbnb/lottie-web) and [postprocessing](https://github.com/pmndrs/postprocessing) are newly bundled. [Motion](https://github.com/motiondivision/motion) and [Tweakpane](https://github.com/cocopon/tweakpane) would duplicate existing interface/state controls in this release.
- [Remotion](https://github.com/remotion-dev/remotion), its [official skills](https://github.com/remotion-dev/skills), and [Manim](https://github.com/ManimCommunity/manim) remain external authoring/rendering workflows. Import their finished video into Frame and retain the original source project. Remotion has its own commercial eligibility/license conditions; “100% free for everyone” is not an accurate blanket description. No Remotion dependency or skill is installed automatically.
- [Three GPU Pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer), [Jolt Physics](https://github.com/jrouwe/JoltPhysics) and [Three.quarks](https://github.com/Alchemist0823/three.quarks) now have editable scene integrations. Jolt bakes bounded rigid-body shots into normal keyframes; Quarks uses seeded source-time cues; the pinned WebGL path tracer renders mesh lighting to a defined sample budget. Particle overlays use mesh depth but are not traced emitters/reflections. See [simulation workflow](FRAME-5-SIMULATION.md) for scope and current verification.
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [librosa](https://github.com/librosa/librosa), [WhisperX](https://github.com/m-bain/whisperX) and [LosslessCut](https://github.com/mifi/lossless-cut) connect through the workflows described above. Their model/runtime installations are separate from the app download.
- [CosyVoice](https://github.com/QwenAudio/CosyVoice) and [OBS Studio](https://github.com/obsproject/obs-studio) remain external speech/capture tools. Import their WAV/video output. Frame's built-in local speech uses Kokoro; it does not falsely label that output CosyVoice or claim to control OBS.

Source licenses do not automatically grant rights to model weights, training data, generated assets, hosted plans or every dependency. Bundled notices are in THIRD-PARTY-NOTICES.md and public/licenses. See the release verification report for actual tests and explicit untested paths.

## Revision and interchange details

A trimmed Motion scene retains its complete source document and the selected clip range. AI revision prompts state both the source duration and visible interval; accepted output preserves the offset. Existing imported Lottie geometry is supplied to the model by reference, avoiding huge repeated vector JSON in prompts and responses. Human edits still have the full embedded vector source. Re-import a `.motion.json` source file through Motion or the main file importer to retain its clip range.
