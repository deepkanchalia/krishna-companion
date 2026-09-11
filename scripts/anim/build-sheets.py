#!/usr/bin/env python3
"""Turn the green-screen darshan clip into sprite sheets + a manifest.

Usage: build-sheets.py <frames_dir> <out_dir> --segments name:start_s:end_s:fps:loop ...

Each segment becomes <out_dir>/<name>.webp (grid sheet) and an entry in
<out_dir>/manifest.json with per-frame source rects and scene offsets so the
renderer can place each frame where the figure actually was (walk motion kept).
Keying: chroma distance from green, with spill suppression and a 1 px feather.
"""
import sys, os, json, math, argparse
import numpy as np
from PIL import Image

SRC_FPS = 24
SRC_W, SRC_H = 1344, 768

_session = None
def matte_frame(rgb):
    """AI matte (rembg u2net_human_seg) for clips without a clean green screen."""
    global _session
    from rembg import remove, new_session
    if _session is None:
        _session = new_session('u2net_human_seg')
    out = np.array(remove(Image.fromarray(rgb, 'RGB'), session=_session))
    return out[..., :3], out[..., 3]

def key_frame(rgb):
    im = rgb.astype(np.int16)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    # green dominance -> alpha 0; soft edge over a 30-unit band
    dom = g - np.maximum(r, b)
    alpha = np.clip((60 - dom) / 30.0, 0, 1)
    # spill suppression: pull green down to max(r,b) where it dominates slightly
    g2 = np.minimum(g, np.maximum(r, b) + 12)
    out = np.stack([r, g2, b], axis=-1).clip(0, 255).astype(np.uint8)
    a = (alpha * 255).astype(np.uint8)
    return out, a

def bbox(a, thresh=8):
    ys, xs = np.where(a > thresh)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('frames_dir'); ap.add_argument('out_dir')
    ap.add_argument('--segments', nargs='+', required=True)
    ap.add_argument('--scale', type=float, default=1.0, help='scale factor applied to every frame')
    ap.add_argument('--quality', type=int, default=82)
    ap.add_argument('--cols', type=int, default=8)
    ap.add_argument('--matte', choices=['chroma', 'rembg'], default='chroma', help='background removal method')
    ap.add_argument('--prefix', default='', help='path prefix for sheet files in the manifest (e.g. "cartoon/")')
    args = ap.parse_args()
    keyer = matte_frame if args.matte == 'rembg' else key_frame
    os.makedirs(args.out_dir, exist_ok=True)
    manifest = {'sourceFps': SRC_FPS, 'sourceWidth': SRC_W, 'sourceHeight': SRC_H, 'scale': args.scale, 'segments': {}}
    for spec in args.segments:
        name, s, e, fps, loop = spec.split(':')
        s, e, fps = float(s), float(e), int(fps); loop = loop == 'loop'
        step = SRC_FPS / fps
        idxs = [int(round(s * SRC_FPS + k * step)) for k in range(int(math.floor((e - s) * fps)))]
        idxs = [i for i in idxs if 0 <= i < 100000]
        frames = []
        for i in idxs:
            p = os.path.join(args.frames_dir, f'f{i+1:04d}.png')
            if not os.path.exists(p):
                continue
            rgb = np.array(Image.open(p).convert('RGB'))
            out, a = keyer(rgb)
            bb = bbox(a)
            if bb is None:
                continue
            x0, y0, x1, y1 = bb
            rgba = np.dstack([out, a])[y0:y1, x0:x1]
            im = Image.fromarray(rgba, 'RGBA')
            if args.scale != 1.0:
                im = im.resize((max(1, int(im.width * args.scale)), max(1, int(im.height * args.scale))), Image.LANCZOS)
            frames.append((im, x0, y0))
        if not frames:
            print('segment', name, 'has no frames'); continue
        fw = max(f[0].width for f in frames); fh = max(f[0].height for f in frames)
        cols = min(args.cols, len(frames)); rows = math.ceil(len(frames) / cols)
        sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
        entries = []
        for k, (im, x0, y0) in enumerate(frames):
            cx, cy = (k % cols) * fw, (k // cols) * fh
            # bottom-align inside the cell so feet stay on one line
            sheet.paste(im, (cx, cy + (fh - im.height)))
            entries.append({'sx': cx, 'sy': cy + (fh - im.height), 'w': im.width, 'h': im.height,
                            'ox': round(x0 * args.scale), 'oy': round(y0 * args.scale)})
        path = os.path.join(args.out_dir, f'{name}.webp')
        sheet.save(path, 'WEBP', quality=args.quality, method=6)
        manifest['segments'][name] = {'file': f'{args.prefix}{name}.webp', 'fps': fps, 'loop': loop, 'cell': [fw, fh],
                                      'frames': entries, 'source': [s, e]}
        print(f'{name}: {len(frames)} frames, cell {fw}x{fh}, sheet {sheet.width}x{sheet.height}, {os.path.getsize(path)//1024} KB')
    if 'idle' in manifest['segments']:
        manifest['segments']['idle']['pingpong'] = True
    json.dump(manifest, open(os.path.join(args.out_dir, 'manifest.json'), 'w'), indent=1)
    # The renderer runs under connect-src 'none', so the manifest ships as a script, not JSON.
    with open(os.path.join(args.out_dir, 'manifest.js'), 'w') as f:
        f.write('// Generated by build-sheets.py from the darshan clip; do not edit by hand.\n')
        f.write('window.KRISHNA_ANIM = ' + json.dumps(manifest, separators=(',', ':')) + ';\n')
    total = sum(os.path.getsize(os.path.join(args.out_dir, f)) for f in os.listdir(args.out_dir))
    print('total', total // 1024, 'KB')

if __name__ == '__main__':
    main()
