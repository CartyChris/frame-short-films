# Frame 5 — Short Films AI Harness

[Open the hosted studio](https://frame-short-films.vercel.app). The included source also runs locally and builds a macOS app. Release-specific deployment and installer checks are in [VERIFICATION.md](docs/VERIFICATION.md).

## New simulation tools

In **3D studio**, expand Physics, Particle effects and GPU path tracing. Edit colliders and bake physical motion before exporting. Use Film camera for traced light; pause to refine the preview. Keep complete-project backups of settings and source tracks. See [simulation workflow](docs/FRAME-5-SIMULATION.md).

## Motion tools

Open **Motion** for editable choreography and supported Lottie JSON. In **3D studio**, enable cinematic effects for bloom and color grading. **Studios → Production tools** imports captions, music timing and cut lists, and connects a local ComfyUI workflow. **Tool library** explains all 20 reviewed projects and what runs where. See [integration guide](docs/MOTION-INTEGRATIONS.md).

## Make a film

1. **Chat** helps develop a story, cast and shot plan with your selected model. Save the proposal, or open **Produce** with a fresh idea.
2. In **Produce**, describe the film, select an agent and animation approach, and choose **Produce the movie**. This starts automatic planning, reusable character/model creation, scene generation, an editable musical score, and optional local narration. Completed steps are applied to your timeline. Pause and resume with another model when needed.
3. **Casting** changes the shared look: paper/toon/pixel/ink characters, sketches, image references, and editable 3D parts. One model identity can appear throughout the film. Open **3D / code → Edit model parts** to shape a generated model.
4. **3D studio** lets you move objects, adjust animation paths and joints, and direct the camera. **Film** combines these scenes with HTML/CSS/JavaScript, images, generated footage and audio. **Story & cast** holds continuity and reviewable revision queues.
5. **Sound & music** provides a sequencer, piano roll, instruments, mixer effects, recording, imported audio and narration. Preview an editable score and add its WAV to the film. The final film mix controls timing, trim, fades and loops.
6. Export **Single-file HTML** to watch/share the film, or **Complete project** to keep source, media, prior versions and unfinished drafts. The offline renderer can make MP4 from the same project.

The supplied 3D example remains available through **3D studio → Explore the animated example**. The original paper-cutout reference is available in the Film library. Release examples are crafted demonstration films; they do not establish access to a live paid AI account.

## Free local sound and paid connections

Procedural composition and effects run locally with no API. Local Kokoro narration downloads a 92.4 MB model plus voice/runtime files on the first explicit request, then synthesizes on-device. Its cache is managed by the browser. Completed phrases are preserved if a run stops. A film embeds the resulting audio; the person watching does not need the voice model.

Connected AI agents and optional image/video/cloud-voice models use your selected provider. Their usage charges apply. Codex and Claude Code use installed signed-in tools through the local companion; Frame does not extract their OAuth credentials. Ordinary API generation works in the Vercel app without that companion. No paid fallback is automatic.

## Longer films and recoverability

Choose a longer target in Produce or Story & cast and build it from manageable shots. Keep the app open during production; unfinished work resumes from its checkpoints. The music renderer makes cues up to 120 seconds, which can loop or be stitched across a long timeline. Synth-only PulseForge `.pfproj` files can be exchanged; export recorded/sample tracks as WAV before importing them into Frame.

Canonical models preserve their underlying identity. Image/video references and story context improve consistency, but generative media can still drift. Keep portable backups: local browser storage and native backups are not cloud synchronization.

## Release files

Frame 5 release packages use these names:

- `Frame-5-Short-Films-AI-Harness.zip` — source, Vercel configuration, native build code, local companion, integrations, documentation and included assets.
- `Frame-5-macOS-Apple-Silicon.dmg` — the separate Apple Silicon installer. Check the release verification for its signing/notarization and runtime acceptance status.
- `Frame-5-SHA256SUMS.txt` — checksums for the supplied release artifacts.

Use the release folder's example HTML/project/video files as named there. Prior Frame releases remain separate; do not mistake an older installer for this release. [README.md](README.md) contains complete setup, provider, export and format details. [VERIFICATION.md](docs/VERIFICATION.md) records the exact current **PASS**, **FAIL** and **NOT RUN** results, including paid-account and physical-device boundaries.

For iPhone/iPad, open the hosted app in Safari and use **Share → Add to Home Screen**. Scroll the workspace tabs to reach all studios. Landscape provides more editing space. HTML playback and audio depend on the target viewer's browser engine and autoplay rules.
