#!/usr/bin/env python3
"""Opt-in local beat analysis. No installation, network fetch, or source mutation."""
import argparse
import hashlib
import json
import pathlib
import sys
import wave


def inspect_wav(path, max_seconds):
    if not path.is_file() or path.stat().st_size > 512 * 1024 * 1024:
        raise ValueError('Choose an existing PCM WAV smaller than 512 MB.')
    with wave.open(str(path), 'rb') as wav:
        duration = wav.getnframes() / wav.getframerate()
        if wav.getcomptype() != 'NONE' or not 1 <= wav.getnchannels() <= 2:
            raise ValueError('Use uncompressed mono or stereo PCM WAV.')
        if not 0 < duration <= max_seconds:
            raise ValueError('Split long audio into shorter WAV files, then set each import offset in Frame.')
        return duration


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=pathlib.Path, help='Original PCM WAV (never modified)')
    parser.add_argument('output', type=pathlib.Path, help='NEW analysis JSON; existing files are refused')
    parser.add_argument('--max-seconds', type=int, default=1800, help='1–7200; default 30 minutes per analysis')
    args = parser.parse_args(argv)
    if not 1 <= args.max_seconds <= 7200:
        parser.error('--max-seconds must be 1–7200')
    if args.output.exists() or args.source.resolve() == args.output.resolve():
        parser.error('Output must be a new file, different from the source.')
    duration = inspect_wav(args.source, args.max_seconds)
    try:
        import librosa
        import numpy as np
    except ImportError:
        parser.error('Install librosa in a separate Python environment first. This helper never installs packages.')
    y, sr = librosa.load(str(args.source), sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time')
    energy = librosa.feature.rms(y=y)[0]
    energy_times = librosa.frames_to_time(np.arange(len(energy)), sr=sr)
    stride = max(1, (len(energy) + 1999) // 2000)
    digest = hashlib.sha256()
    with args.source.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    result = {'format': 'frame-audio-analysis', 'version': 1, 'name': args.source.name,
              'duration': duration, 'sourceHash': digest.hexdigest(), 'sampleRate': sr,
              'engine': 'librosa', 'engineVersion': librosa.__version__,
              'tempo': float(np.asarray(tempo).reshape(-1)[0]),
              'beats': [float(t) for t in beats if 0 <= t <= duration],
              'onsets': [float(t) for t in onsets if 0 <= t <= duration],
              'rms': [{'time': float(energy_times[i]), 'value': float(energy[i])}
                      for i in range(0, len(energy), stride) if energy_times[i] <= duration]}
    if len(result['beats']) > 20000 or len(result['onsets']) > 20000:
        raise ValueError('Too many timing points. Analyze shorter sections.')
    # Exclusive create prevents accidental replacement, including a late race.
    with args.output.open('x', encoding='utf-8') as target:
        json.dump(result, target, allow_nan=False, separators=(',', ':'))
    print(f'Saved {len(result["beats"])} beats to {args.output.name}. Original audio preserved.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, wave.Error) as error:
        sys.exit(str(error))
