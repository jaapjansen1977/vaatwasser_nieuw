# Kitchen VR prototype

kitchen.glb is a procedural, true 3D kitchen prototype in metres, not a reconstructed panorama. kitchen.blend is the editable source; build_kitchen.py reproduces the model using Blender. preview.png is an offline overview render.

The GLB contains separate Plate_01 through Plate_06 mesh nodes. Shelf_adjustable groups the shelf and brackets; its initial top surface is approximately 1.43 m. Set the group Y position to shoulderHeight - 0.05 - 0.0275 to align its top with the experiment's target height. glTF uses Y up. The participant starts at (0,0,0), looking toward negative Z in the exported GLB. The room is approximately 6 by 6 metres. Apply no arbitrary model scaling when integrating with WebXR.

Load kitchen.glb in a WebXR-capable viewer or engine. Enable positional headset tracking and use a trustworthy HTTPS origin for Quest access. The model provides geometry for motion parallax; headset tracking is provided by the viewer, not by the file itself. Use the viewer's own lighting; no lights or camera are exported. The file has not yet been tested on a Quest 2.

Grabbing, collision detection, manipulated visual hand position, calibration, plate placement and data logging require application code. They are not embedded in this asset. The original application has not been changed. This is a low-detail visual prototype, not a photorealistic scene or a validated experimental setup. Confirm reach, depth, height and frame rate in headset before use.
