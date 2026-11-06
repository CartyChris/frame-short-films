# Frame ↔ Blender

The exchange ZIP contains a real animated `scene.glb`, `frame-scene.json`, and this optional local add-on. It does not require a server, account, or AI provider.

1. In Frame, select a 3D scene and choose **Export to Blender**.
2. Extract `frame_blender.py` from the ZIP. Review it, then use Blender **Preferences → Add-ons → Install from Disk** and enable **Frame Film Exchange** (Blender 4.2+). In versions with a different preferences layout, use their add-on installation menu. The script makes no network calls.
3. Choose **File → Import → Frame Film** and select the original ZIP. The scene is added in a new collection. Existing objects are kept; the frame range and active camera switch to the imported film. Hide existing unrelated objects before exporting.
4. Edit, rig, animate, or render in Blender. Choose the active camera and the scene frame range you want.
5. Choose **File → Export → Frame Film**, then import the resulting `.frame3d.zip` in Frame's Integrations panel.

The return package becomes one model with its real geometry, materials, rigs, morphs and supported glTF animation. Frame can place and animate that model. Editing individual mesh vertices, constraints, modifiers and shader node graphs remains a Blender operation. The original Frame procedural controls are not reconstructed from an edited mesh.

For a standard workflow without the add-on, import `scene.glb` directly in Blender and export **glTF 2.0 → GLB**, with animations and skinning enabled. Import that GLB into Frame's cast library.

glTF supports mesh transforms, skeletal and morph animation, PBR material subsets, cameras and punctual lights. Blender compositor effects, arbitrary shader nodes, physics simulations, area/world lighting and native constraints do not round-trip as editable features. Bake effects into supported animation or video. The add-on samples the active camera (maximum 2,000 samples); perspective cameras are supported, orthographic projection is approximated. Frame's GLB exporter also bounds samples for long or complex scenes. Preserve the `.blend` master for full fidelity.

Meshes use meters and Y-up in the exchange; Blender's importer/exporter handles its native Z-up coordinates. Camera keys are explicitly converted. Animated camera roll and lens effects are not represented in Frame's position/target camera controls.

This add-on has archive-validation and syntax checks. A live Blender round trip requires Blender on your machine and is not claimed by those checks.

Primary references: [Blender glTF manual](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html), [Blender export API](https://docs.blender.org/api/current/bpy.ops.export_scene.html).
