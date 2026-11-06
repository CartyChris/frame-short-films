"""Standard-library safety/checkpoint tests. Does not import installed AI engines."""
import contextlib
import hashlib
import io
import json
import pathlib
import tempfile
import types
import unittest
import wave
from unittest import mock
import librosa_beats
import whisperx_captions


class HelpersTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / 'source.wav'
        with wave.open(str(self.source), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(b'\0\0' * 16000)

    def test_pcm_duration_gate(self):
        self.assertEqual(librosa_beats.inspect_wav(self.source, 1), 1)
        with self.assertRaises(ValueError):
            librosa_beats.inspect_wav(self.source, .5)

    def test_output_overwrite_is_refused_before_engine_import(self):
        output = self.root / 'existing.json'
        output.write_text('keep me')
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            librosa_beats.main([str(self.source), str(output)])
        self.assertEqual(output.read_text(), 'keep me')

    def test_model_download_requires_explicit_flag(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            whisperx_captions.main([str(self.source), str(self.root / 'new.json')])
        self.assertFalse((self.root / 'new.json').exists())

    def test_transcript_checkpoint_survives_alignment_failure(self):
        before = hashlib.sha256(self.source.read_bytes()).hexdigest()
        transcript = {'language': 'en', 'segments': [{'start': 0, 'end': 1, 'text': 'Saved words.'}]}
        def fail_alignment(**kwargs):
            raise RuntimeError('simulated interrupted alignment download')
        fake = types.SimpleNamespace(load_audio=lambda path: [0],
            load_model=lambda *args, **kwargs: types.SimpleNamespace(transcribe=lambda *args, **kwargs: transcript),
            load_align_model=fail_alignment)
        output = self.root / 'new.json'
        with mock.patch.dict('sys.modules', {'whisperx': fake}), self.assertRaises(RuntimeError):
            whisperx_captions.main([str(self.source), str(output), '--allow-model-download'])
        self.assertFalse(output.exists())
        self.assertEqual(json.loads((self.root / 'new.transcript-checkpoint.json').read_text()), transcript)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), before)


if __name__ == '__main__':
    unittest.main()
