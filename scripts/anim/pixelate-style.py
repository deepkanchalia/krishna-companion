#!/usr/bin/env python3
"""Derive a pixel-art figure style from an existing sheet set.

Every frame of <src>/manifest.json is downscaled by --factor with a box filter,
snapped to one shared palette of --colors entries, given a hard-edged alpha, and
scaled back up with nearest-neighbour so the frame rects and scene offsets stay
exactly those of the source style: the motion, the placement math and the tests
are unchanged. The player switches off image smoothing for a style whose
manifest carries `pixelated: true`.

Usage: pixelate-style.py assets/anim/warrior assets/anim/pixel --factor 8 --colors 32
"""
import argparse, json, os
from PIL import Image

PALETTE_SAMPLES = {'idle': 6, 'walkin': 10, 'teach': 15, 'farewell': 5}


def frames(manifest, src):
    sheets = {}
    for name, seg in manifest['segments'].items():
        path = os.path.join(src, os.path.basename(seg['file']))
        sheets[name] = Image.open(path).convert('RGBA')
    return sheets


def small(frame, factor):
    w, h = frame.size
    return frame.resize((max(1, w // factor), max(1, h // factor)), Image.BOX)


def build_palette(manifest, sheets, factor, colors):
    strips = []
    for name, index in PALETTE_SAMPLES.items():
        seg = manifest['segments'].get(name)
        if not seg:
            continue
        f = seg['frames'][min(index, len(seg['frames']) - 1)]
        crop = sheets[name].crop((f['sx'], f['sy'], f['sx'] + f['w'], f['sy'] + f['h']))
        strips.append(small(crop, factor))
    width = sum(s.width for s in strips)
    height = max(s.height for s in strips)
    mosaic = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    x = 0
    for s in strips:
        mosaic.paste(s, (x, 0))
        x += s.width
    opaque = Image.new('RGB', mosaic.size, (0, 0, 0))
    opaque.paste(mosaic, mask=mosaic.getchannel('A'))
    return opaque.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)


def pixelate(frame, factor, palette):
    s = small(frame, factor)
    alpha = s.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    rgb = Image.new('RGB', s.size, (0, 0, 0))
    rgb.paste(s, mask=s.getchannel('A'))
    snapped = rgb.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGB')
    out = snapped.convert('RGBA')
    out.putalpha(alpha)
    return out.resize(frame.size, Image.NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--factor', type=int, default=8)
    ap.add_argument('--colors', type=int, default=32)
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()
    manifest = json.load(open(os.path.join(args.src, 'manifest.json')))
    sheets = frames(manifest, args.src)
    palette = build_palette(manifest, sheets, args.factor, args.colors)
    os.makedirs(args.out, exist_ok=True)
    prefix = os.path.basename(os.path.normpath(args.out)) + '/'
    for name, seg in manifest['segments'].items():
        sheet = sheets[name]
        out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
        for f in seg['frames']:
            box = (f['sx'], f['sy'], f['sx'] + f['w'], f['sy'] + f['h'])
            out.paste(pixelate(sheet.crop(box), args.factor, palette), box)
        out.save(os.path.join(args.out, f'{name}.webp'), 'WEBP', quality=args.quality, method=6)
        seg['file'] = prefix + f'{name}.webp'
    manifest['pixelated'] = True
    manifest['derivedFrom'] = os.path.basename(os.path.normpath(args.src))
    manifest['pixelFactor'] = args.factor
    json.dump(manifest, open(os.path.join(args.out, 'manifest.json'), 'w'), indent=1)
    total = sum(os.path.getsize(os.path.join(args.out, p)) for p in os.listdir(args.out))
    print(f'{args.out}: factor {args.factor}, {args.colors} colours, {total // 1024} KB')


if __name__ == '__main__':
    main()
