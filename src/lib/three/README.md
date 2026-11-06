# The shared 3D engine

The editor, portable HTML films, and deterministic MP4 renderer use the same Three.js engine. `Scene.three` stores scene data and `Project.models` stores reusable cast/geometry. The exported film stores the runtime and referenced model bytes once; it creates at most two live scene frames for transitions. `sourceOffset` uses the ordinary film clock, so split shots continue their original animation.

- `defaults.ts`: `builtInModels`, `createThreeDocument(preset?,duration?)`.
- `document.ts`: `normalizeThreeDocument(input,models)` / `validateThreeDocument`; they return normalized data or throw for unknown model IDs/duplicate placements. Numeric fields are bounded and finite. Rotations are radians, positions use Y-up Three.js units. This is data validation, not code isolation.
- `Stage3D.tsx`: editor/camera viewport, orbit and transform controls. `onTransform` commits on release; orbit camera changes are separate from the canonical film camera. Root owns editing/keyframe UI and persistent project state.
- `io.ts`: `importModel(files)` converts one primary model plus supplied dependencies into self-contained GLB; `exportSceneGlb(document,models,{start?,duration?})` exports actual geometry and baked animation. Pass a clip’s `sourceOffset` as `start` and its timeline duration to export a trimmed or split shot.
- `html.ts`: await `initThreeRuntime()` at app startup. Native code can `setThreeRuntime(source)`. `buildThreeChildDocument` is pure and closure-free so the film player can generate isolated scene documents lazily.
- Run `node scripts/build-three-runtime.mjs` after engine changes. The resulting `public/runtime/frame-three.js` ships offline; no CDN is required.

## Supported model inputs

GLB, glTF (embedded or with selected buffer/texture files), FBX, OBJ with selected MTL/textures, STL, PLY. Select one primary model and its companion files together. Original units are preserved. Whole-scene Blender returns can set environment `geometry:false` and `defaultLights:false` to retain their own geometry/key lights without duplication; the studio keeps ambient fill because glTF does not encode it. Model placement scale remains editable. No model dependency is silently fetched from a remote URL. Missing textures/buffers stop import with the file name. Texture images must be formats the browser can decode. Proprietary source features do not necessarily map to glTF PBR materials. Compressed Draco, meshopt, and Basis/KTX models need an uncompressed GLB conversion before import; external decoder dependencies are not bundled.

## Portable animation

Built-in casts have actual articulated limbs and stable shared appearances. Walk, wave, dance, idle, instance paths, transform keyframes, camera keyframes, and imported glTF clips all use explicit time. Scrubbing does not integrate frame-to-frame physics. Export bakes object, rig, imported-animation and camera transforms at up to 24 fps, with a memory-bounded sample budget for very long scenes. The resulting GLB has an animation clip and real meshes; it can be reopened in Frame or Blender.

The HTML/MP4 paths preserve titles, animated particles, sound and camera FOV changes. Standard glTF export includes 3D geometry/materials/lights and camera transforms, but excludes HTML titles/audio and cannot animate perspective FOV or changing particle vertex positions. Those remain in the editable Frame archive. Long GLB animations may use fewer samples than the original film FPS; the HTML/MP4 exporter remains frame-accurate.

## Verification

`npx vitest run tests/three.test.ts tests/three-browser.test.ts tests/film.test.ts tests/editing.test.ts` exercises canonical cast identity, normalization failures, deterministic keyframes, safe document serialization, single-copy long-film assets, real Chrome offline frame seeking, repeat-frame pixel identity, multi-scene playback, model conversion, supplied texture preservation and animated GLB roundtrip. Browser tests use `CHROME_PATH` or the macOS Chrome installation and report skipped if it is unavailable.
