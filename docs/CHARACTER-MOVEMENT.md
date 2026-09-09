# Articulated darshan · branch design

User-directed revision: replace the still-image slide with actual body movement.
Fable remains orchestrator; this work stays on `codex/darshan-message-animation`.

## Movement vocabulary

1. Walking: alternate hips, bending knees, lifted swing foot, counter-swinging arms.
2. Arrival: slow the final step, plant feet, acknowledge the reader with a head dip.
3. Teaching: raise an arm, bend the elbow, offer a teaching hand toward the verse.
4. Explanation: add the other forearm and a small nod, then release the gesture.
5. Reading: restrained breathing and cloth movement, no repeated big gestures or whole-head blink swaps.
6. Listening: incline the head and chest. No invented spoken dialogue or lip sync.
7. Departure: small acknowledgment, lower the arm and withdraw without flattening or mirroring the body.

## Combinations

| Event | Sequence | Timing |
|---|---|---|
| New darshan | Walk → settle → acknowledge → verse → teaching gesture | 3.2 s entrance; 4.3 s gesture |
| Next verse | Keep feet planted → message → teaching hand → rest | 0.32 s message; 4.3 s gesture |
| Expand purport | Open arm → second forearm → small nod → rest | 5.7 s |
| Listening | Ease into head tilt → attentive breathing | 1 s blend-in |
| Reading | Breathing + light sash sway | Continuous, restrained |
| End darshan | Small acknowledgment → short steps → absent | 3.2 s |
| Reduced motion | Immediate settled pose and readable text | No animation loop |

## Three art directions, one rig

- Painterly: midnight and electric blue, luminous antique gold, brush texture;
  color/mood reference supplied by user: https://share.google/p8STBxW2eQDba7eDh.
- Realistic: retain the existing blue-and-gold devotional character direction,
  now with full-body parts. This is a painted 2D rig, not a photoreal 3D human.
- Pixel art: separately generated pixel artwork, hard edges, smooth motion timing.

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
a checkerboard masquerading as transparency. Only three allowlisted local
styles can be selected; the renderer makes no remote connection.

## Motion correction · 2026-09-09 · review only

Deep rejected the cutout animation as distorted and mechanical. Do not treat
the earlier screenshots or passing tests as approval of that movement.

Removed the scale-through-zero turn, entire-forearm gesture swaps and whole-head
blink swaps. Limbs are assembled once in their rest pose, feathered across the
seam, then bent as continuous constant-width ribbons. A 36px bend region replaces
the sharp joint pivot. Steps and gestures have restrained angle limits, a 1.4 s
step cycle, quintic easing and 0.8 s transitions from the currently displayed pose.
Front-facing head art is used throughout so the figure attends to the reader.

The preview has exact-time in-place inspection, normal-speed and quarter-speed
playback for walking, teaching, explanation, listening and withdrawal. In-place
review deliberately suppresses root travel so all joints remain visible; Replay
arrival still exercises actual travel. Automated checks assert bounded angles,
frame-to-frame continuity, constant ribbon lengths, no reflection/scaling collapse,
and animation-loop cancellation. They do not certify natural or devotional quality.

**Not complete:** natural left/right head turns. Generated directional candidates
changed crown orientation or failed the requested facing direction. Only the
front-facing center frame is enabled; remaining frames are not selected at runtime.
An identity-consistent authored turnaround/in-between sequence is needed before
enabling side turns. Motion still needs Deep's visual acceptance before release.

## Acceptance

- Both knees and elbows visibly articulate; all three styles share the same poses.
- A full body including both feet is visible at desktop and compact widths.
- Ending while arriving cancels the arrival/message sequence.
- When absent, reduced-motion or hidden, no continuous animation loop runs.
- Scripture, source validation, one-entry advancement and focus rules are unchanged.
- Native frame budget and five-minute CPU measurements remain manual before merge.
