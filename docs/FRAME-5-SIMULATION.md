# Simulation and rendering

In 3D studio, Physics controls physical motion, Particle effects controls Three.quarks emitters, and GPU path tracing controls mesh lighting. Both manual editing and AI scene revisions use the same saved scene format. AI drafts remain reviewable and recoverable.

## Physics

Assign explicit box or sphere colliders to existing objects. Dimensions and center offsets use model-local units; object scale is applied. Other visible scenery does not collide unless assigned a static body. There are no automatic mesh colliders, ragdolls, cloth or fluids.

Jolt 1.1.1 simulates at a fixed 60 Hz, with up to 32 bodies and 30 seconds per bake. Longer films use separate shots. Bake stages a result; Apply saves ordinary editable position/rotation keyframes. Original tracks are retained. Restore preserves subsequent manual edits, and changed physical inputs invalidate the bake. The final physical pose holds after the bake interval.

HTML, MP4 and animated geometry exports reject unbaked or stale physical motion. Complete-project backups retain settings and unfinished work. Exported films play saved keyframes without downloading Jolt. Trimmed clips retain their source time, including after an AI revision.

## Particle effects

Three.quarks 0.17.1 uses a saved seed, fixed-step updates and the film's source clock. Fireflies, sparks, snow and confetti are editable starting points. Change position, direction, emission shape, colors, speed, size, gravity and timing. Backward seeking rebuilds a bounded cue; each emitter has an independent random stream.

A shot allows up to four emitters, 20 seconds of emission plus a lifetime tail of up to six seconds, and a bounded total live-particle count. Looping repeats the complete emission-plus-tail cue. Ordinary GLB exports omit particle-rendering helpers; use HTML or video for their appearance.

## GPU path tracing

Film camera previews traced lighting; the editor camera stays rasterized for responsive object manipulation. Pause to refine the preview. Set final samples from 1–64, preview samples from 1–16, light bounces from 1–8, and resolution scale from 0.25–1. Higher settings take longer. Low sample counts can be visibly noisy.

Frame pins three-gpu-pathtracer 0.0.28's legacy WebGL backend for compatibility with its existing Three renderer and Mac webview. The library's newer recommended API is WebGPU. This is actual GPU path tracing, not an NVIDIA RTX/CUDA integration. WebGL2 and floating-point render targets are required; unsupported capabilities or shaders produce visible errors. A narrow shader adapter avoids an out/inout compiler defect in macOS 27 beta WebKit without changing system settings.

Meshes receive traced lighting. Fog is not a traced volume. Quarks and analytic particles are depth-composited over the result: they can be occluded by meshes, but do not cast traced light, shadows or reflections. Screen finishing remains available after composition.

Each exported frame waits for its final sample budget. Reference images also wait for a completed film-camera frame. The renderer has bounded timeouts and preserves a partial MP4 after failure; it does not silently replace failed tracing with raster output.

## Interface and verification

Editor headings use a consistent sans-serif typeface. Empty states and instructions use plain production language. The Chat icon is centered without orbital decoration, and triangular play icons are optically centered independently of pause icons. Film content and its chosen typography remain editable and unchanged by these interface adjustments.

See [release verification](VERIFICATION.md) and [native acceptance](MACOS-ACCEPTANCE.md) for the exact tested build, results and device limits. Source and a checkpoint archive were saved before the first simulation test run.
