# Frame Sound Studio

Frame adapts the user's PulseForge procedural composer, instruments, effects, event compiler, and WAV encoder. Editable music lives in `Project.soundtrack`; generated audio is a normal Frame media asset and can be embedded in a portable HTML film. No PulseForge process or backend is started.

## Interfaces

- `composeSoundtrack(direction)` (`compose.ts`) synchronously accepts text, explicit `ComposeOptions`, or a native `ProductionSpec`, and returns a validated `SoundtrackDocument`. It creates real notes, patterns, clips, routing, and effects using PulseForge's seeded rules. This is local procedural composition, not a downloaded neural music model.
- `renderSoundtrack(document, options)` (`render.ts`) returns `{blob, duration, sampleRate, peak, peaks}`. `loop:true` preserves exact musical duration and folds the effect tail into the beginning. Without it, the WAV includes a two-second tail. `patternId` renders a selected pattern. `signal` stops before work or discards the derived WAV after native rendering; source music remains intact.
- `renderSoundEffect(id)` renders a bounded procedural one-shot from the inspected PulseForge catalog.
- `validateSoundtrack`, `importSoundtrack`, and `exportSoundtrack` are in `document.ts`.
- `SoundStudio` receives the film project, media assets, connection selection, root recording controls, `onChange(document, projectId)`, and `onAddAudio({projectId, blob, name, duration, loop})`. Optional `onSaveSpeechCheckpoint` durably stores local speech phrases before inference continues. Optional `active:false` pauses its HTML audio preview while background rendering can finish.

Every async import/render/speech action captures its original film ID. WAV previews retain their original ID when added later. Local narration keeps completed audio on cancellation and save failure; paid narration is checkpointed to the media store immediately after receipt, before decoding or film attachment. No speech provider request is made merely by opening the UI or selecting a provider.

## Editing and portability

Score provides composition direction/style/mood/tempo/key/seed, step editing, a piano roll with draw/move/resize/delete, instrument presets and parameters, mutes/solo, gain/pan, and effect chains. The editor has a drag/keyboard resize divider. Voice provides the root microphone, imported takes, optional local Kokoro narration, or an explicitly selected paid speech provider. Effects renders procedural Foley/textures/transitions. Film mix edits the normal Frame audio layers' start, source trim, duration, gain, fades, loop, and mute, with waveforms derived from actual PCM.

`*.framesound.json` preserves the Frame wrapper and composition specification. `*.pfproj` exports PulseForge's native `project.json` schema. Imports retain native note, pattern, clip, and mixer IDs. Scores containing recorded audio, takes, sampled instruments, unsupported meters, missing references, or mixer feedback are rejected with instructions to export those parts as WAV. This is intentionally a synth-only PulseForge project exchange, not a full DAW archive migration. Recordings can be imported separately into Film mix.

## Limits and current boundaries

- 4/4 music; up to 48 rack instruments, 128 patterns, 1,024 clips, 64 mixer channels, 30,000 note/step events, and 12 effects per mixer strip.
- Source JSON up to 4 MB and arrangements up to 30 minutes. A single offline render is bounded to 120 seconds; use pattern rendering and loop/stitch WAVs for longer films.
- Source editing is immediate; parameter changes are heard after the next preview render. Browser-native offline audio cannot be stopped mid-render. Rendering is serialized because Tone uses a global context.
- Piano/string/brass/guitar/choir presets are synthesized approximations. No Salamander, VSCO, or other recorded sample library is included.
- Tempo and rack-volume automation import is rejected. Existing mixer/effect automation is retained; the Sound Studio UI does not yet provide automation-curve editing.
- Frame local speech has its own model download/cache and limits in `local-speech.ts`; this sound renderer does not download audio models. Live paid-provider requests and microphone capture need user action.
- Narration timing on the film timeline remains editable. The score does not infer dialogue timing or automatically duck music beneath every spoken word.

## Focused verification

From the application directory:

```
npm run test -- tests/sound.test.ts
npm run test:e2e -- e2e/sound-studio.spec.ts
```

The sound browser suite builds an isolated real React/Tone harness and serves it on a temporary loopback port. It does not require a Vite server. `CHROME_PATH` can override the installed Chrome executable. It exercises real Web Audio synthesis, PCM/WAV integrity, all offered engines and effects, score editing and IndexedDB recovery, mobile layout, and a mocked provider-result/save failure. It never makes paid requests. See `PROVENANCE.md` and `source-hashes.json` for reuse details.
