"""Frame exchange: an explicitly installed, local Blender add-on.

Imports only scene.glb and frame-scene.json from a selected archive. It never
runs embedded scripts, downloads assets, or deletes the existing scene.
"""
bl_info = {"name": "Frame Film Exchange", "author": "Frame", "version": (1, 0, 0),
           "blender": (4, 2, 0), "location": "File > Import / Export",
           "description": "Exchange animated GLB scenes with Frame", "category": "Import-Export"}

import json
import math
import os
import tempfile
import zipfile

try:
    import bpy
    from bpy.props import StringProperty
    from bpy_extras.io_utils import ImportHelper, ExportHelper
    from mathutils import Vector
except ImportError:
    bpy = None  # Pure archive validation can be tested without Blender installed.

MAX_GLB = 150 * 1024 * 1024
MAX_MANIFEST = 10 * 1024 * 1024


def read_exchange(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        for name, limit in [("frame-scene.json", MAX_MANIFEST), ("scene.glb", MAX_GLB)]:
            if names.count(name) != 1:
                raise ValueError("The archive needs exactly one " + name)
            info = archive.getinfo(name)
            if info.file_size > limit or info.flag_bits & 1:
                raise ValueError("Oversized or encrypted Frame archive entry: " + name)
        manifest = json.loads(archive.read("frame-scene.json"))
        if manifest.get("format") != "frame-blender" or manifest.get("version") != 1:
            raise ValueError("Unsupported Frame exchange version")
        model = archive.read("scene.glb")
        if model[:4] != b"glTF":
            raise ValueError("scene.glb is not a binary glTF file")
        return manifest, model


def to_y_up(vector):
    return [float(vector[0]), float(vector[2]), -float(vector[1])]


def camera_document(scene, fps):
    start, end = scene.frame_start, scene.frame_end
    saved_frame = scene.frame_current
    saved_subframe = scene.frame_subframe
    result = []
    # Bound interchange size, including very long films. Full object animation
    # still lives in the GLB. Frame's camera interpolation uses these samples.
    sample_count = min(2000, max(2, end - start + 1))
    try:
        for index in range(sample_count):
            frame = start + (end - start) * index / (sample_count - 1)
            scene.frame_set(int(frame), subframe=frame % 1)
            camera = scene.camera
            if camera is None:
                break
            evaluated = camera.evaluated_get(bpy.context.evaluated_depsgraph_get())
            position = evaluated.matrix_world.translation
            forward = evaluated.matrix_world.to_quaternion() @ Vector((0, 0, -1))
            result.append({"time": (frame - start) / fps, "position": to_y_up(position),
                           "target": to_y_up(position + forward * 10),
                           "fov": max(10, min(120, math.degrees(evaluated.data.angle_y))),
                           "easing": "linear"})
    finally:
        scene.frame_set(saved_frame, subframe=saved_subframe)
    return result


if bpy:
    class FRAME_OT_import(bpy.types.Operator, ImportHelper):
        bl_idname = "import_scene.frame_exchange"
        bl_label = "Frame Film (.frame3d.zip)"
        bl_options = {"UNDO"}
        filename_ext = ".zip"
        filter_glob: StringProperty(default="*.zip", options={"HIDDEN"})

        def execute(self, context):
            try:
                manifest, model = read_exchange(self.filepath)
                before = set(bpy.data.objects)
                with tempfile.TemporaryDirectory(prefix="frame-import-") as directory:
                    path = os.path.join(directory, "scene.glb")
                    with open(path, "wb") as handle:
                        handle.write(model)
                    bpy.ops.import_scene.gltf(filepath=path)
                    for image in bpy.data.images:
                        if image.source == "FILE" and image.filepath.startswith(directory):
                            image.pack()
                collection = bpy.data.collections.new(manifest.get("name", "Frame scene")[:200])
                context.scene.collection.children.link(collection)
                added = set(bpy.data.objects) - before
                for obj in added:
                    for owner in list(obj.users_collection):
                        owner.objects.unlink(obj)
                    collection.objects.link(obj)
                imported_camera = next((obj for obj in added if obj.type == "CAMERA"), None)
                if imported_camera:
                    context.scene.camera = imported_camera
                fps = max(1, min(120, int(manifest.get("fps", 24))))
                duration = max(.1, min(86400, float(manifest.get("duration", 12))))
                context.scene.render.fps = fps
                context.scene.render.fps_base = 1
                context.scene.frame_start = 1
                context.scene.frame_end = max(2, round(duration * fps) + 1)
                # glTF cannot animate camera FOV. Restore the manifest's lens
                # curve while keeping the imported camera transform animation.
                camera_keys = manifest.get("document", {}).get("camera", {}).get("keyframes", [])
                if imported_camera and isinstance(camera_keys, list):
                    imported_camera.data.type = "PERSP"
                    imported_camera.data.sensor_fit = "VERTICAL"
                    imported_camera.data.sensor_height = 24
                    for key in camera_keys[:2000]:
                        if isinstance(key, dict) and isinstance(key.get("fov"), (int, float)):
                            fov = max(10, min(120, key["fov"]))
                            imported_camera.data.lens = 12 / math.tan(math.radians(fov) / 2)
                            imported_camera.data.keyframe_insert(data_path="lens", frame=1 + max(0, float(key.get("time", 0))) * fps)
                context.scene.frame_set(1)
                self.report({"INFO"}, "Added Frame scene; existing objects were kept")
                return {"FINISHED"}
            except Exception as error:
                self.report({"ERROR"}, str(error))
                return {"CANCELLED"}

    class FRAME_OT_export(bpy.types.Operator, ExportHelper):
        bl_idname = "export_scene.frame_exchange"
        bl_label = "Frame Film (.frame3d.zip)"
        filename_ext = ".frame3d.zip"
        filter_glob: StringProperty(default="*.zip", options={"HIDDEN"})

        def execute(self, context):
            try:
                scene = context.scene
                fps = scene.render.fps / scene.render.fps_base
                duration = max(.1, (scene.frame_end - scene.frame_start) / fps)
                camera_keys = camera_document(scene, fps)
                first = camera_keys[0] if camera_keys else {"position": [10, 6.5, 12], "target": [0, 1.2, 0], "fov": 42}
                document = {"version": 1, "duration": duration,
                            "environment": {"preset": "studio", "sky": "#c4bfbb", "ground": "#a5a29a", "fog": False, "lightIntensity": 1, "particles": False},
                            "camera": {**first, "motion": "static", "amplitude": 0, "keyframes": camera_keys},
                            "instances": [], "title": "", "subtitle": ""}
                manifest = {"format": "frame-blender", "version": 1, "direction": "from-blender",
                            "name": scene.name, "fps": fps, "duration": duration, "document": document,
                            "modelFile": "scene.glb", "units": "meters", "upAxis": "Y",
                            "note": "Blender scene is one editable model in Frame; mesh hierarchy and supported animation stay in its GLB."}
                with tempfile.TemporaryDirectory(prefix="frame-export-") as directory:
                    path = os.path.join(directory, "scene.glb")
                    options = {"filepath": path, "export_format": "GLB", "export_yup": True,
                               "export_cameras": True, "export_animations": True, "export_frame_range": True,
                               "export_force_sampling": True, "export_skins": True, "export_morph": True,
                               "export_lights": True, "export_extras": True, "use_visible": True}
                    properties = bpy.ops.export_scene.gltf.get_rna_type().properties
                    if "export_animation_mode" in properties:
                        options["export_animation_mode"] = "SCENE"
                    if "export_anim_slide_to_zero" in properties:
                        options["export_anim_slide_to_zero"] = True
                    options = {key: value for key, value in options.items() if key in properties}
                    bpy.ops.export_scene.gltf(**options)
                    if os.path.getsize(path) > MAX_GLB:
                        raise ValueError("GLB exceeds 150 MB. Optimize the scene before returning it to Frame.")
                    with zipfile.ZipFile(self.filepath, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                        archive.write(path, "scene.glb")
                        archive.writestr("frame-scene.json", json.dumps(manifest, ensure_ascii=False, indent=2))
                self.report({"INFO"}, "Exported animated Frame exchange")
                return {"FINISHED"}
            except Exception as error:
                self.report({"ERROR"}, str(error))
                return {"CANCELLED"}

    def menu_import(self, context):
        self.layout.operator(FRAME_OT_import.bl_idname, text="Frame Film (.frame3d.zip)")

    def menu_export(self, context):
        self.layout.operator(FRAME_OT_export.bl_idname, text="Frame Film (.frame3d.zip)")

    def register():
        bpy.utils.register_class(FRAME_OT_import)
        bpy.utils.register_class(FRAME_OT_export)
        bpy.types.TOPBAR_MT_file_import.append(menu_import)
        bpy.types.TOPBAR_MT_file_export.append(menu_export)

    def unregister():
        bpy.types.TOPBAR_MT_file_import.remove(menu_import)
        bpy.types.TOPBAR_MT_file_export.remove(menu_export)
        bpy.utils.unregister_class(FRAME_OT_export)
        bpy.utils.unregister_class(FRAME_OT_import)

    if __name__ == "__main__":
        register()
