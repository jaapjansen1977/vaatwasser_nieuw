# Vaatwasser VR v11

Open `dev/v11.html` through a trusted HTTPS origin in the Meta Quest Browser. `index.html` and `dev/v10.html` retain their existing behavior. For desktop inspection only: run `python3 -m http.server 8000` from the repository root. Start VR requires a headset; localhost on another machine is not reachable from a Quest.

## Protocol

1. Select the experimental arm before entering VR. Stand centrally with sufficient physical space, facing the intended task direction.
2. Start VR. Hold both controllers, let both arms hang relaxed and press either trigger. The application averages five seconds of controller-to-head offsets; motion beyond 5.5 cm restarts the interval.
3. Put each controller against the corresponding shoulder and press either trigger. Both shoulders and shoulder-to-controller reach estimates are stored. Keep looking ahead. These measurements do not independently identify anatomical upper- and lower-arm lengths: the IK model uses a 48/52 split.
4. Move the selected hand to a comfortable start position and press its trigger. This starts the 120-second trial. The other trigger cannot pick up or place objects.
5. Touch the front plate with the visual hand and press the selected trigger. Lift it to the near portion of the shelf and trigger again. Only the first plate is interactive. After placement, the same front plate returns to exactly its original position after 450 ms; the task never advances to a deeper plate.
6. At completion, press either trigger (or a face button) to exit VR. Download the CSV from the page. Automatic downloads can be restricted by the browser; the latest CSV is also backed up in `localStorage.vaatwasser_last_csv`. Holding the selected grip for two seconds aborts. Exiting VR, prolonged controller loss or session visibility loss aborts a running trial and preserves available data. Reset starts a new calibration.

## Manipulation and coordinate rules

- The existing schedule is retained: 1.00, .95, .90, .85, .80, .75, changing every 20 seconds. Vertical hand position is `startY + gain * (controllerY - startY)`; X/Z and hand orientation retain tracking. The anchor is the fixed trial start height, not the shoulder.
- Grasp and shelf acceptance both use the manipulated visual position, not an invisible raw hand. A grasp retains the plate-to-hand offset. No raw-controller model, laser, true hand, height number, gain number or measurement plot is shown in VR. Real positions and visual height remain in the CSV for analysis.
- The room is aligned to the participant's head X/Z and forward horizontal heading at shoulder calibration. The front plate is approximately 60 cm forward of this origin, with its original 7 cm lateral offset. The room and shelf then stay fixed in world space. The shelf top is 5 cm below the selected calibrated shoulder.
- Shoulder positions follow headset translation using the stored head-to-shoulder offsets. Head rotation alone does not rotate the assumed torso. This approximates body motion; head and torso cannot be distinguished from this hardware alone. No torso tracking is claimed.
- Two-bone IK estimates elbows; the controllers do not measure elbows. Segment lengths remain fixed. When a manipulated hand target exceeds inferred reach by more than 2.5 cm, the sleeve/forearm is hidden rather than stretched, while the experimental hand position is preserved; CSV marks `arm_unreachable`. Check fit on the actual participant before experimental use.
- Plates placed on the shelf are arranged into short front-row stacks; the task uses trigger-based grabbing/placement without a physics engine. Reserve plates remain visual scenery.

## Performance and verification

The kitchen GLB uses approximately 8,400 triangles and four embedded 512px textures; plate geometry/materials are shared. Lighting uses a hemisphere and one directional light, with no real-time shadow maps, physics simulation or postprocessing. Renderer requests foveation and a high refresh rate when supported. This is not a measured frame-rate guarantee.

Browser integration tests exercise left/right selection, bilateral calibration and movement reset, gain boundaries, arm lengths, headset translation, repeated front-plate pickups, front-edge placements, respawn delay, CSV logging, trial finish, tracking loss and reset. They use synthetic tracked poses and do not validate physical headset tracking. Run with a local server and Python Playwright: `python3 tests/v11-browser.py`. `AFRAME_BUNDLE=/path/to/aframe-1.7.1.min.js` optionally supplies the official bundle locally during tests; normal use loads pinned A-Frame 1.7.1 from jsDelivr.

Before using this as a measurement instrument, verify both controller mappings, instruction visibility, reach and shelf position, arm fit, plate grasp, CSV download, tracking interruptions and sustained performance on the actual Quest 2. No headset or clinical validation has been performed here.

## Assets

`assets/kitchen-v11/kitchen.glb` is the generated lightweight kitchen prototype. The local Roboto MSDF atlas and metadata come from https://github.com/aframevr/assets/tree/master/fonts; Roboto is Apache-2.0 licensed (see `Roboto-LICENSE.txt`). A-Frame is MIT licensed and loaded from its pinned npm distribution through jsDelivr. No package install or build step is required.
