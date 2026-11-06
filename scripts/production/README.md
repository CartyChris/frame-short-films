# Optional local production helpers

These helpers are opt-in. Frame does not install or invoke them in the background. They read a selected mono/stereo PCM WAV, leave it unchanged, and refuse to replace an existing output. Default input limit: 30 minutes and 512 MB; use shorter sections and Frame’s timeline offset for long films. The maximum explicit duration is two hours. Python/model memory and inference speed remain machine-dependent.

Review the scripts, create separate environments, and install engines there. Do not merge CosyVoice, WhisperX and librosa development requirements into Frame’s Node environment. No engine or model is bundled with these scripts. CLI `--help` needs only Python’s standard library.

## Beat analysis

librosa 0.11.0 is the documented stable API target (Python >=3.8); compatible environments also need NumPy, SciPy, soundfile, numba and related packages. Current development-branch requirements may differ. See [official installation](https://librosa.org/doc/0.11.0/install.html).

After reviewing and installing librosa in your own environment:

```sh
python scripts/production/librosa_beats.py '/path/to/score.wav' '/path/to/new-score-beats.json'
```

Import the JSON under Studios → Production tools → Rhythm. The helper writes estimated tempo, beat/onset seconds, a bounded RMS summary, version metadata and source SHA-256. It does not upload audio or fetch models. Review the suggestions before splitting scenes.

## Captions and word timing

Follow [WhisperX’s official setup](https://github.com/m-bain/whisperX). Current upstream uses Python >=3.10,<3.14, PyTorch, faster-whisper/CTranslate2 and alignment dependencies; GPU setup has separate CUDA requirements. Use an isolated environment. The helper defaults to CPU/int8, batch size one and the small model. `--device cuda` is opt-in and requires a working GPU environment. Apple GPU acceleration is not claimed.

```sh
python scripts/production/whisperx_captions.py '/path/to/narration.wav' '/path/to/new-captions.json' --language en --allow-model-download
```

The explicit flag permits first-use speech/alignment model downloads. The audio is processed locally by the installed engine. This helper enables no speaker diarization, and requires no paid provider. Preserve your existing model cache; no installer or cleanup is run. Import final JSON as full segments or one aligned word per caption. Words without timing are disclosed; no timestamps are invented.

A separate `.transcript-checkpoint.json` is written immediately after transcription, before alignment. If alignment fails, import that checkpoint in segment mode. Neither completed transcript nor aligned output is overwritten. Recovery before the transcription call returns is limited by WhisperX itself; the helper does not claim token-by-token checkpoints.

## Other production tools

LosslessCut: export seconds CSV (Start, End, Name). Marker-only rows with no end are not clips; give them explicit end times before import. Strict JSON `.llc` is accepted; native JSON5 `.llc` can be converted/exported through LosslessCut. Frame’s trims reuse the video and append editable scenes, not lossless file outputs.

ComfyUI: use your installed local service, export an API-format workflow, review its nodes, then submit through the paired companion. Custom nodes can execute code or use paid/network services; local transport is not proof a graph stays offline. Saved workflow credentials are rejected for common credential fields; configure credentials in ComfyUI itself and review every imported graph. This validation is not a sandbox for arbitrary custom nodes.

CosyVoice: the canonical repo is now [QwenAudio/CosyVoice](https://github.com/QwenAudio/CosyVoice). Generate audio in its own environment and import a WAV. Official Python endpoints stream raw PCM; a live CosyVoice adapter is not shipped. OBS remains an external recording application. FFmpeg is used by Frame’s existing local renderer.
