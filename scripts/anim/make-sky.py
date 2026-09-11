#!/usr/bin/env python3
"""Generate assets/card-sky.webp: an original, tileable cloud texture in gold over
umber, used as a subtle layer under the card's text. Periodic 1/f noise from the
frequency domain, so the tile repeats without a seam and can drift.

Usage: make-sky.py assets/card-sky.webp [--size 640 --seed 7]
"""
import argparse
import numpy as np
from PIL import Image


def periodic_noise(size, beta, rng):
    white = rng.standard_normal((size, size))
    spectrum = np.fft.fft2(white)
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    spectrum /= f ** (beta / 2)
    spectrum[0, 0] = 0
    field = np.real(np.fft.ifft2(spectrum))
    field -= field.min()
    return field / field.max()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--size', type=int, default=640)
    ap.add_argument('--seed', type=int, default=7)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    # big soft billows plus finer wisps
    v = 0.7 * periodic_noise(args.size, 3.2, rng) + 0.3 * periodic_noise(args.size, 2.2, rng)
    v = (v - v.min()) / (v.max() - v.min())
    # clouds live in the bright third: a soft threshold keeps most of the tile clear
    lit = np.clip((v - 0.52) / 0.48, 0, 1) ** 1.6
    gold = np.array([245, 208, 132], dtype=np.float32)
    umber = np.array([150, 108, 58], dtype=np.float32)
    rgb = umber[None, None, :] * (1 - lit[..., None]) + gold[None, None, :] * lit[..., None]
    alpha = (lit * 0.85 + np.clip((v - 0.35) / 0.65, 0, 1) * 0.2) * 255
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(args.out, 'WEBP', quality=80, method=6)
    print(args.out, args.size, 'px tile')


if __name__ == '__main__':
    main()
