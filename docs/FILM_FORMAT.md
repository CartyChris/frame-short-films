# Film composition and portable HTML

`buildFilmHtml(project, assets, { controls: true })` creates a self-contained player document. Original scene code and media bytes are preserved. For editor previews, use `{ controls: false }` and control the iframe through messages. Do not grant the preview `allow-same-origin`.

The scene timeline has no 30-second ceiling. It loads one scene at a time, with at most one outgoing scene during a dissolve. At the exact end of a project, the last scene is held at its final frame. Layers can be images, videos, text, or audio, with scene-relative start/duration, position, size, rotation, opacity, blend mode, fade in/out, volume, mute, loop, and source trim. Project audio uses project-relative time. Position is a percentage; x/y identify the layer center; width is a percentage of the film frame.

## Deterministic scene interface

A fully controllable HTML scene exposes:

```js
window.film = {
  duration: 12,
  renderAt(seconds) { /* draw the complete frame, including text */ },
  seek(seconds) { /* same as renderAt */ },
  play() {},
  pause() {}
};
```

Use a seeded random generator, elapsed scene time, and a single render surface when possible. All six supplied templates include original procedural artwork and typography on one canvas; they need no external runtime libraries or fonts. The film host pauses a scene's private clock and calls `renderAt` from the project clock.

Imported HTML without a Film API still opens inside the scene sandbox. The bridge can synchronize CSS/Web Animations and ordinary media, but cannot reliably seek an arbitrary private JavaScript animation clock. It reports `controlled: false`; adding the Film API enables accurate timing. This is a capability distinction, not a promise that arbitrary HTML can be rewritten automatically.

## Editor message protocol

Messages to the exported player:

- `{ type: 'frame:seek', time: 8.5, playing: false }`
- `{ type: 'frame:play' }`
- `{ type: 'frame:pause' }`
- `{ type: 'frame:mute', muted: true }`

Messages from player to editor:

- `{ type: 'frame:time', time, playing, duration }`
- `{ type: 'frame:scene-status', sceneId, controlled }`
- `{ type: 'frame:scene-error', sceneId, message }`

Validate `event.source` against the actual preview iframe before accepting messages. Parent/child bridges do this. The player document exposes the same `window.film` API for native renderers. Scene frames have opaque origins and no app credentials. Sandboxing does not make imported code trusted: it is an isolation boundary, not a static-code certification.

## Portability and recording

`inspectExternalResources(html)` lists apparent network/relative resource references to help identify offline export dependencies. It is advisory and cannot identify dynamically assembled URLs. Media asset bytes should be `data:` URLs; expired generation URLs or temporary object URLs are not durable asset storage. The editor should save downloaded bytes before claiming a generation has been imported.

`recordFilmTab()` asks the user to choose a film tab/window and records the entire visible composition with MediaRecorder. It includes DOM overlays, WebGL, images, and video. The user must choose the exported film tab and enable tab audio to include its soundtrack. This is a real-time recording and the browser chooses the supported video codec. It is not a universal headless MP4 conversion service. On iPhone browsers where display capture is unavailable, use the single-file HTML export or desktop rendering.

`generateToneWav(kind, seconds)` generates original stereo PCM WAV bytes, with a precise duration, fade-in/fade-out, and peak normalization below clipping. Built-in choices: ambient, piano, chime, pulse. Clips can be up to ten minutes; loop them on the timeline for longer projects. Procedural sound and recorded/generated narration are ordinary embedded assets, so they travel with a single-file HTML film.

## Native frame acknowledgement

A renderer can add a unique `requestId` to `frame:seek`. The player replies with `frame:rendered` containing that ID, time, scene ID, and control status only after the scene clock and video seeks settle. Failures return `frame:render-error`. Parent/source checks remain in place. See `VIDEO_EXPORT.md` for the included offline MP4 renderer.

## 3D scenes, cast and editable interchange

A 3D shot stores `Scene.three` and uses `Project.models` for the shared model library. Each placed object refers to an `assetId`; appearance/model changes can propagate to every shot using that ID. Imported model bytes are embedded GLB data URLs. The 3D scene keeps `code: ''` for legacy project compatibility; when `three` exists it supplies the base animation under ordinary image/video overlays.

`Scene.sourceOffset` is the start within its original animation clock. Splitting or trimming changes the timeline range while retaining the original 3D document and source clock. Object/camera keys use that source time, not the newly shortened clip's local zero. An accepted new AI scene starts at zero and retains the previous complete scene as a recoverable version.

The editable `.frame3d.json` interchange contains `{format:'frame-3d-scene', version:1, document, models, sourceOffset, duration}`. It preserves procedural scene controls and the relevant model definitions. The full `.frame.json` project archive additionally preserves layers, sound, story canon, production queues, raw generation chunks and revisions. Blender `.frame3d.zip` exchange instead bakes supported geometry/animation and samples the camera; see `integrations/README.md` for its limits.

Project-scoped model and character IDs remain stable when restoring a backup, so an unfinished JSON draft still refers to its intended cast. Global project, scene, run, media, revision and queue IDs are remapped to keep the restored copy independent. Old scene aliases allow saved film-plan drafts to resolve the corresponding restored scenes.
