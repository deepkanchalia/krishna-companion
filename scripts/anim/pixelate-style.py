#!/usr/bin/env python3
"""Derive a pixel-art figure style from an existing sheet set.

Every frame of <src>/manifest.json is boosted in saturation and contrast,
box-downscaled by --factor, snapped without dithering to one palette shared by
every segment (--colors entries), given a hard-edged alpha, outlined in a dark
line along the silhouette and along strong interior edges (the hard-shaded,
outlined look of hand-drawn pixel art), and scaled back up with
nearest-neighbour so the frame rects and scene offsets stay exactly those of
the source style: the motion, the placement math and the tests are unchanged.
The player switches off image smoothing for a style whose manifest carries
`pixelated: true`.

Usage: pixelate-style.py assets/anim/warrior assets/anim/pixel --factor 4 --colors 32
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


def pixelate(frame, palette, args):
    s = small(boost(frame, args.saturation, args.contrast), args.factor)
    alpha = s.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    rgb = Image.new('RGB', s.size, OUTLINE)
    rgb.paste(s, mask=s.getchannel('A'))
    snapped = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGB')
    if args.outline:
        snapped = outline(snapped, alpha, args.edge, args.line)
    out = snapped.convert('RGBA')
    out.putalpha(alpha)
    return out.resize(frame.size, Image.NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--factor', type=int, default=4, help='source pixels per art pixel')
    ap.add_argument('--colors', type=int, default=32)
    ap.add_argument('--saturation', type=float, default=1.7)
    ap.add_argument('--contrast', type=float, default=1.25)
    ap.add_argument('--outline', action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument('--edge', type=int, default=36, help='luminance step that draws an interior line')
    ap.add_argument('--line', type=float, default=0.7, help='how dark an interior line is, 0..1')
    ap.add_argument('--quality', type=int, default=82)
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
            out.paste(pixelate(sheet.crop(box), palette, args), box)
        out.save(os.path.join(args.out, f'{name}.webp'), 'WEBP', quality=args.quality, method=6)
        seg['file'] = prefix + f'{name}.webp'
    manifest['pixelated'] = True
    manifest['derivedFrom'] = os.path.basename(os.path.normpath(args.src))
    manifest['pixelFactor'] = args.factor
    json.dump(manifest, open(os.path.join(args.out, 'manifest.json'), 'w'), indent=1)
    total = sum(os.path.getsize(os.path.join(args.out, p)) for p in os.listdir(args.out))
    print(f'{args.out}: factor {args.factor}, {args.colors} colours, outline {args.outline}, {total // 1024} KB')


if __name__ == '__main__':
    main()
