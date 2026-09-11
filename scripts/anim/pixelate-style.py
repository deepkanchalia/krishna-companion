#!/usr/bin/env python3
"""Derive a pixel-art figure style from an existing sheet set.

Every frame of <src>/manifest.json is boosted in saturation and contrast,
box-downscaled by --factor, snapped without dithering to one palette shared by
every segment (--colors entries), given a hard-edged alpha, outlined in a dark
line along the silhouette and along strong interior edges (the hard-shaded,
outlined look of hand-drawn pixel art), and scaled back up with
nearest-neighbour so the frame rects and scene offsets stay exactly those of
the source style (sheets are written lossless so the palette survives): the motion, the placement math and the tests are unchanged.
The player switches off image smoothing for a style whose manifest carries
`pixelated: true`.

Shipped: pixelate-style.py assets/anim/warrior assets/anim/pixel --factor 3 --colors 24 --line 0.85 --edge 48

Dependencies are pinned in scripts/anim/requirements.txt (numpy, Pillow).
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageEnhance

PALETTE_SAMPLES = {'idle': 6, 'walkin': 10, 'teach': 15, 'farewell': 5}
OUTLINE = (24, 16, 40)


def frames(manifest, src):
    sheets = {}
    for name, seg in manifest['segments'].items():
        path = os.path.join(src, os.path.basename(seg['file']))
        sheets[name] = Image.open(path).convert('RGBA')
    return sheets


def boost(frame, saturation, contrast):
    out = ImageEnhance.Color(frame).enhance(saturation)
    return ImageEnhance.Contrast(out).enhance(contrast)


def small(frame, factor):
    w, h = frame.size
    return frame.resize((max(1, w // factor), max(1, h // factor)), Image.BOX)


def build_palette(manifest, sheets, args):
    strips = []
    for name, index in PALETTE_SAMPLES.items():
        seg = manifest['segments'].get(name)
        if not seg:
            continue
        f = seg['frames'][min(index, len(seg['frames']) - 1)]
        crop = sheets[name].crop((f['sx'], f['sy'], f['sx'] + f['w'], f['sy'] + f['h']))
        strips.append(small(boost(crop, args.saturation, args.contrast), args.factor))
    width = sum(s.width for s in strips)
    height = max(s.height for s in strips)
    mosaic = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    x = 0
    for s in strips:
        mosaic.paste(s, (x, 0))
        x += s.width
    opaque = Image.new('RGB', mosaic.size, OUTLINE)
    opaque.paste(mosaic, mask=mosaic.getchannel('A'))
    return opaque.quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT)


def outline(rgb, alpha, edge_threshold, strength):
    """Dark line where an opaque pixel touches a transparent one, and where the
    luminance changes sharply between neighbours (a fold, a jewel, the hairline)."""
    a = np.asarray(alpha, dtype=np.uint8) > 0
    c = np.asarray(rgb, dtype=np.int16)
    lum = (c[..., 0] * 299 + c[..., 1] * 587 + c[..., 2] * 114) // 1000
    pad = np.pad(a, 1, constant_values=False)
    touches_air = a & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    lp = np.pad(lum, 1, mode='edge')
    darker = np.maximum.reduce([lp[:-2, 1:-1] - lum, lp[2:, 1:-1] - lum, lp[1:-1, :-2] - lum, lp[1:-1, 2:] - lum])
    # a pixel on the dark side of a strong step becomes the line, so lines sit inside the
    # darker region and never eat the lit side
    interior = a & (darker >= edge_threshold)
    line = touches_air | interior
    out = c.copy()
    out[line] = (np.array(OUTLINE) * strength + out[line] * (1 - strength)).astype(np.int16)
    out[touches_air] = OUTLINE
    return Image.fromarray(out.astype(np.uint8), 'RGB')


def pixelate(frame, palette, args, anchor=(0, 0)):
    # The art grid is anchored to the scene, not to each frame's crop: pad the crop by the
    # frame's scene offset modulo the factor so blocks land on the same scene grid in every
    # frame and never shift between frames.
    px, py = anchor[0] % args.factor, anchor[1] % args.factor
    if px or py:
        padded = Image.new('RGBA', (frame.width + px, frame.height + py), (0, 0, 0, 0))
        padded.paste(frame, (px, py))
        frame = padded
    s = small(boost(frame, args.saturation, args.contrast), args.factor)
    alpha = s.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    rgb = Image.new('RGB', s.size, OUTLINE)
    rgb.paste(s, mask=s.getchannel('A'))
    snapped = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGB')
    if args.outline:
        snapped = outline(snapped, alpha, args.edge, args.line)
    out = snapped.convert('RGBA')
    out.putalpha(alpha)
    out = out.resize((s.width * args.factor, s.height * args.factor), Image.NEAREST)
    # back to the frame's own size (partial blocks at the far edges are dropped)
    canvas = Image.new('RGBA', frame.size, (0, 0, 0, 0))
    canvas.paste(out, (0, 0))
    return canvas.crop((px, py, frame.width, frame.height))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--factor', type=int, default=3, help='source pixels per art pixel')
    ap.add_argument('--colors', type=int, default=24)
    ap.add_argument('--saturation', type=float, default=1.7)
    ap.add_argument('--contrast', type=float, default=1.25)
    ap.add_argument('--outline', action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument('--edge', type=int, default=48, help='luminance step that draws an interior line')
    ap.add_argument('--line', type=float, default=0.85, help='how dark an interior line is, 0..1')
    args = ap.parse_args()
    manifest = json.load(open(os.path.join(args.src, 'manifest.json')))
    sheets = frames(manifest, args.src)
    palette = build_palette(manifest, sheets, args)
    os.makedirs(args.out, exist_ok=True)
    prefix = os.path.basename(os.path.normpath(args.out)) + '/'
    for name, seg in manifest['segments'].items():
        sheet = sheets[name]
        out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
        for f in seg['frames']:
            box = (f['sx'], f['sy'], f['sx'] + f['w'], f['sy'] + f['h'])
            out.paste(pixelate(sheet.crop(box), palette, args, (f['ox'], f['oy'])), box)
        # lossless: a lossy encode would smear the palette back into thousands of colours
        out.save(os.path.join(args.out, f'{name}.webp'), 'WEBP', lossless=True, method=6)
        seg['file'] = prefix + f'{name}.webp'
    manifest['pixelated'] = True
    manifest['derivedFrom'] = os.path.basename(os.path.normpath(args.src))
    manifest['pixelFactor'] = args.factor
    manifest['pixelColors'] = args.colors
    manifest['pixelOptions'] = {'saturation': args.saturation, 'contrast': args.contrast, 'outline': args.outline, 'edge': args.edge, 'line': args.line}
    manifest['lossless'] = True
    json.dump(manifest, open(os.path.join(args.out, 'manifest.json'), 'w'), indent=1)
    total = sum(os.path.getsize(os.path.join(args.out, p)) for p in os.listdir(args.out))
    print(f'{args.out}: factor {args.factor}, {args.colors} colours, outline {args.outline}, {total // 1024} KB')


if __name__ == '__main__':
    main()
