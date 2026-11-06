#!/usr/bin/env python3
"""Opt-in WhisperX transcription/alignment of a chosen PCM WAV. No installs."""
import argparse
import json
import pathlib
import sys
import wave
from librosa_beats import inspect_wav


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=pathlib.Path, help='Original PCM WAV (never modified)')
    parser.add_argument('output', type=pathlib.Path, help='NEW WhisperX JSON; existing files refused')
    parser.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium', 'large-v3'])
    parser.add_argument('--language', help='Optional language code, e.g. en')
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    parser.add_argument('--max-seconds', type=int, default=1800)
    parser.add_argument('--allow-model-download', action='store_true', help='Explicitly allow first-use model downloads')
    args = parser.parse_args(argv)
    if not args.allow_model_download:
        parser.error('First use may download speech and alignment models. Review setup, then add --allow-model-download.')
    if not 1 <= args.max_seconds <= 7200:
        parser.error('--max-seconds must be 1–7200')
    if args.output.exists() or args.source.resolve() == args.output.resolve():
        parser.error('Output must be a new file, different from the source.')
    inspect_wav(args.source, args.max_seconds)
    checkpoint = args.output.with_name(args.output.stem + '.transcript-checkpoint.json')
    if checkpoint.exists():
        parser.error('A transcript checkpoint already exists. Import it, or choose a new output filename.')
    try:
        import whisperx
    except ImportError:
        parser.error('Install WhisperX in its own Python environment first. This helper never installs packages.')
    audio = whisperx.load_audio(str(args.source))
    model = whisperx.load_model(args.model, args.device, compute_type='int8' if args.device == 'cpu' else 'float16',
                                language=args.language, vad_method='silero')
    result = model.transcribe(audio, batch_size=1)
    # Keep segment text/times even if alignment, a download, or final writing fails.
    with checkpoint.open('x', encoding='utf-8') as target:
        json.dump(result, target, ensure_ascii=False, allow_nan=False)
    del model
    alignment, metadata = whisperx.load_align_model(language_code=result['language'], device=args.device)
    aligned = whisperx.align(result['segments'], alignment, metadata, audio, args.device, return_char_alignments=False)
    aligned['language'] = result['language']
    with args.output.open('x', encoding='utf-8') as target:
        json.dump(aligned, target, ensure_ascii=False, allow_nan=False)
    print(f'Saved aligned captions to {args.output.name}. Segment checkpoint and original audio preserved.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, wave.Error) as error:
        sys.exit(str(error))
