# Frame 3 production conductor

**Produce** runs a saved production from a brief or an existing shot plan. **Chat** offers a conversation and a proposal first. Both use the selected connection; switching the connection changes subsequent requests and can continue interrupted text with another model.

The conductor moves through story/cast planning, shared character design, optional paid reference portraits, scenes, optional compositing for mixed-media shots, a PulseForge score, and optional local Kokoro narration per scene. Completed results are ordinary project data: editable timeline scenes, code, structured 3D documents, shared model parts, cast designs, layered media, notes, and audio. Casting, the 3D editor, Film, and Sound & music edit these same data.

## Persistence and continuation

Each model response is journaled in IndexedDB before it is shown. The task's run ID is persisted before the provider request. A cutoff retains every received piece; continuation builds on the exact saved draft. A completed but invalid artifact is retained while a separate corrected artifact is requested. Each step permits three automatic continuation/repair attempts per run and then pauses. A request cap limits text-model calls; raise it and resume without restarting completed work.

Project backups contain sources, shared models, media, journals, queues, and task checkpoints. Restoring creates an independent project. Original provider bytes are not rewritten; aliases resolve restored scene/media identities. Hash checks are conflict detection, not a security boundary. A late scene result or cast design cannot silently replace an intervening manual edit. The user can rebuild that step against the current state.

Portrait and video submissions persist their job records before submission. Unknown submission outcomes pause instead of automatically issuing another paid job. Video polling resumes the original remote job. Image/video generation still depends on the chosen model's supported duration, input references, account limits, and credits.

Closing Frame stops the browser runner. Reopen and choose Resume production. Keep the web/PWA or Mac app open for unattended production; this release does not run a cloud worker after all clients close. The Mac also maintains local project backups. Browser storage can still be cleared by the browser or user: export project backups for durable off-device copies. No app can preserve bytes a provider never transmitted.

## Editing and continuity

Canonical character IDs link the same puppet design or model geometry across scenes. Procedural characters have editable shapes, pivots, parents, joints, colors, and transforms. GLB exports bake supported motion. Film-specific instructions include the previous shot's story state and the shared cast/world. Shared geometry stays identical across uses; generated imagery, video, and arbitrary code remain model-dependent and cannot promise zero visual or narrative drift.

A mixed shot generates its base animation and a separate editable layer command. The compositor can use existing images, video, audio, and plain-text titles with timing, trim, blend, pose, opacity, and volume. It cannot invent asset URLs or execute OS commands. Image/video adapters are currently OpenRouter and Venice; other media tools can supply imported assets. Arbitrary text providers are connected through documented APIs or reviewed CLI adapters.

Long films are shot sequences. The timeline supports hours; production accepts up to ten hours and up to 2,000 text requests. Existing validation bounds shot counts, primitive complexity, media sizes, and individual audio renders. A 120-scene, two-hour plan/seek/export path is tested; a complete two-hour generated movie and MP4 render are not tested. Model quality, request limits, browser memory, disk space and render time still matter.

## Sound

The agent composes a structured PulseForge score, whose notes and mixer remain editable. Local procedural instruments and effects need no inference provider. Cues render up to 120 seconds and can loop across longer timelines; write or import additional cues for a changing long-form score. Sound Studio accepts recordings, uploads, and rendered speech. Synth-only PulseForge projects are portable; the original app's sampled-instrument libraries are not bundled.

Kokoro is real local neural speech, with an approximately 92 MB model download plus voice/runtime files on first use. The model and voices are cached. Each completed speech phrase is saved during production; finished narration becomes a portable WAV asset. A narration longer than its scene is retained intact and production pauses for a longer scene or a shorter script. Resuming an unfinished local synthesis may synthesize again; already saved complete audio is reused. Provider speech remains an optional separate, potentially paid route.

## Automation boundaries

The capability manifest and typed commands in `src/lib/pipeline.ts` connect the studios. Text models need to return the documented schemas; they do not need proprietary tool-calling support. The app validates those outputs and commits them through the same project structures used by manual editing. There is no unrestricted agent control of the computer, arbitrary shell execution, automatic MCP tool approval, or access to another provider's credentials.

The local companion runs reviewed installed coding tools using their supported authentication. It does not export OAuth tokens. See [provider-capabilities.md](provider-capabilities.md) for supported CLI routes, custom registrations, subscription restrictions, and source documentation. Blender/MCP/Tripo exchange remains a separate reviewed external-tools workflow; third-party applications must be installed and available.
