import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile

spec = importlib.util.spec_from_file_location("frame_blender", Path(__file__).parents[1] / "blender/frame_blender.py")
exchange = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exchange)


class ExchangeTests(unittest.TestCase):
    def make_archive(self, entries):
        handle = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        handle.close()
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with warnings.catch_warnings(), zipfile.ZipFile(handle.name, "w") as archive:
            warnings.simplefilter("ignore", UserWarning)
            for name, value in entries:
                archive.writestr(name, value)
        return handle.name

    def valid_entries(self):
        return [("frame-scene.json", json.dumps({"format": "frame-blender", "version": 1})),
                ("scene.glb", b"glTF\x02\x00\x00\x00\x0c\x00\x00\x00")]

    def test_fixed_entries_are_read_without_path_extraction(self):
        entries = self.valid_entries() + [("../../run.py", "raise RuntimeError('must never run')")]
        manifest, model = exchange.read_exchange(self.make_archive(entries))
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(model[:4], b"glTF")

    def test_duplicate_manifest_is_rejected(self):
        entries = self.valid_entries()
        with self.assertRaisesRegex(ValueError, "exactly one"):
            exchange.read_exchange(self.make_archive(entries + [entries[0]]))

    def test_unsupported_version_is_rejected(self):
        entries = self.valid_entries()
        entries[0] = ("frame-scene.json", '{"format":"frame-blender","version":2}')
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            exchange.read_exchange(self.make_archive(entries))

    def test_invalid_glb_is_rejected(self):
        entries = self.valid_entries()
        entries[1] = ("scene.glb", b"not gltf")
        with self.assertRaisesRegex(ValueError, "binary glTF"):
            exchange.read_exchange(self.make_archive(entries))

    def test_z_up_to_y_up_coordinate_mapping(self):
        self.assertEqual(exchange.to_y_up((1, 2, 3)), [1.0, 3.0, -2.0])


if __name__ == "__main__":
    unittest.main()
