#!/usr/bin/env python3
"""Extract frames from a clip and print the figure's horizontal position over time,
plus a dense contact sheet of the standing section, to choose segment bounds.

Usage: analyze-clip.py <clip.mp4> <frames_dir> [--matte rembg]

Dependencies are pinned in scripts/anim/requirements.txt (numpy, Pillow, rembg).
"""
import sys, os, subprocess, glob, json
import numpy as np
from PIL import Image

clip, frames_dir = sys.argv[1], sys.argv[2]
matte = 'rembg' if '--matte' in sys.argv and 'rembg' in sys.argv else 'chroma'
os.makedirs(frames_dir, exist_ok=True)
if not glob.glob(os.path.join(frames_dir, 'f*.png')):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', clip, '-vsync', '0', os.path.join(frames_dir, 'f%04d.png')], check=True)
paths = sorted(glob.glob(os.path.join(frames_dir, 'f*.png')))
print('frames', len(paths))

if matte == 'rembg':
    from rembg import remove, new_session
    session = new_session('u2net_human_seg')

def mask_of(p):
    im = Image.open(p).convert('RGB')
    if matte == 'chroma':
        a = np.array(im).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
        return ~((g > r + 60) & (g > b + 60))
    out = remove(im, session=session)
    return np.array(out)[..., 3] > 16

rows = []
for i, p in enumerate(paths):
    if i % 6: continue  # every quarter second
    m = mask_of(p); ys, xs = np.where(m)
    if len(xs) == 0: rows.append((i, None)); continue
    rows.append((i, dict(cx=float(xs.mean()), x0=int(xs.min()), x1=int(xs.max()), y0=int(ys.min()), y1=int(ys.max()), area=int(m.sum()))))
json.dump(rows, open(os.path.join(frames_dir, 'timeline.json'), 'w'))
for i, m in rows:
    if m: print(f"t={i/24:5.2f}s cx={m['cx']:6.1f} x0={m['x0']:4d} x1={m['x1']:4d} y0={m['y0']:3d} y1={m['y1']:3d} area={m['area']}")
    else: print(f"t={i/24:5.2f}s empty")
