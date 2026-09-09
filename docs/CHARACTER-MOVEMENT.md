# Articulated darshan · branch design

User-directed revision: replace the still-image slide with actual body movement.
Fable remains orchestrator; this work stays on `codex/darshan-message-animation`.

## Movement vocabulary

1. Walking: alternate hips, bending knees, lifted swing foot, counter-swinging arms.
2. Arrival: slow the final step, plant feet, acknowledge the reader with a head dip.
3. Teaching: raise an arm, bend the elbow, offer a teaching hand toward the verse.
4. Explanation: add the other forearm and a small nod, then release the gesture.
5. Reading: restrained breathing, blinking and cloth movement, no repeated big gestures.
6. Listening: incline the head and chest. No invented spoken dialogue or lip sync.
7. Departure: raised-palm farewell, lower the arm, turn and walk out.

## Combinations

| Event | Sequence | Timing |
|---|---|---|
| New darshan | Walk → settle → acknowledge → verse → teaching gesture | 3.2 s entrance; 4.3 s gesture |
| Next verse | Keep feet planted → message → teaching hand → rest | 0.32 s message; 4.3 s gesture |
| Expand purport | Open arm → second forearm → small nod → rest | 5.7 s |
| Listening | Ease into head tilt → attentive breathing | 0.7 s blend-in |
| Reading | Breathing + occasional blink + light sash sway | Continuous, restrained |
| End darshan | Farewell → turn → articulated walk → absent | 3.2 s |
| Reduced motion | Immediate settled pose and readable text | No animation loop |

## Three art directions, one rig

- Painterly: midnight and electric blue, luminous antique gold, brush texture;
  color/mood reference supplied by user: https://share.google/p8STBxW2eQDba7eDh.
- Realistic: retain the existing blue-and-gold devotional character direction,
  now with full-body parts. This is a painted 2D rig, not a photoreal 3D human.
- Pixel art: separately generated pixel artwork, hard edges and stepped cadence.

The selector is in the actual renderer. It remembers only an allowlisted style
in local preferences; changing art never advances a verse. Original artwork and
all corpus/licensing files remain untouched. Preview movement controls do not
write journey progress, request voice permissions or launch Electron.

Clothing revision, 2026-09-09: full-length golden dhoti covers both knees and
calves, leaving only feet visible. A shoulder shawl covers the shoulder joins.
Fuller arms use overlapping continuous skin instead of hollow joint caps;
forearms are layered in front of the drape so hands stay visibly connected.

Assets are generated with the built-in Image Generation tool. The atlas uses
a deliberate magenta key, removed once in an offscreen canvas on load. It is not
a checkerboard masquerading as transparency. Only three allowlisted local files
can be selected; the renderer makes no remote connection.

## Acceptance

- Both knees and elbows visibly articulate; all three styles share the same poses.
- A full body including both feet is visible at desktop and compact widths.
- Ending while arriving cancels the arrival/message sequence.
- When absent, reduced-motion or hidden, no continuous animation loop runs.
- Scripture, source validation, one-entry advancement and focus rules are unchanged.
- Native frame budget and five-minute CPU measurements remain manual before merge.
