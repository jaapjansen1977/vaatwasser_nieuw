# Refined lightweight kitchen prototype

True 3D scene in metres, with six individually movable plate nodes (Plate_01..06) and a separate Shelf_adjustable root. Four embedded 512x512 PNG colour textures: oak flooring, shelf oak, limestone and ceramic backsplash. PBR materials define porcelain, stainless steel and painted cabinetry. Small single-segment bevels catch light on furniture edges. Static meshes are batched by material and semantic parent, and plate geometry is shared.

Export check: 8,356 triangles counting all instances, 20 mesh objects, 15 mesh resources/material primitives, approximately 1.37 MB GLB. These are asset metrics, not a measured Quest frame rate. GLB re-import into Blender succeeded. No large textures, real-time lights, shadow maps, postprocessing, scripts or external dependencies are embedded. A viewer supplies lighting, headset tracking and interaction. Use restrained lighting and avoid expensive real-time shadows when integrating on Quest 2. The preview is an offline Cycles render; it is not evidence of identical lighting or performance in WebXR. Static lightmaps have not been baked.

Use kitchen-refined.glb in WebXR with a trusted HTTPS origin. The participant origin is (0,0,0), looking down negative Z; glTF Y is up. Set Shelf_adjustable.position.y = shoulderHeight - 0.05 - 0.0275 for a shelf top 5 cm below shoulder. Test reach and dimensions on headset. Grabbing, calibration and recording remain application responsibilities. Existing application source is unchanged.

This remains a stylized low-detail prototype, not a photographic reconstruction. Headset rendering quality, stereo artifacts, material appearance and stable frame rate have not yet been tested on Quest 2.
