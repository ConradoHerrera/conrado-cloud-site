#!/usr/bin/env python3
"""
Generates photographic-weight placeholder imagery so you can judge how the
layout behaves with real pictures in it — tonal mass, contrast, how much a
dark image pulls the eye, how an airy one lets the type breathe.

Deliberately abstract: these are original generated fields, not stock photos,
so nothing copyrighted ever sits in the project folder. Drop your own images
into assets/img/ and point projects.json at them whenever you like.

    python3 make_placeholders.py        (needs Pillow)

Delete this file and assets/img/placeholders/ once the real work exists.
"""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageEnhance

OUT = Path(__file__).parent / "assets" / "img" / "placeholders"
OUT.mkdir(parents=True, exist_ok=True)

# Tonal keys — light / mid / dark, warm-neutral like the site's paper and ink.
KEYS = {
    "light": [(238, 235, 228), (222, 218, 209), (247, 245, 240), (208, 203, 194)],
    "mid":   [(150, 145, 137), (186, 180, 170), (112, 108, 102), (205, 199, 189)],
    "dark":  [(38, 37, 35), (64, 61, 57), (22, 21, 20), (92, 87, 80)],
    "warm":  [(196, 92, 64), (150, 78, 58), (228, 206, 188), (96, 52, 42)],
    "cool":  [(74, 88, 104), (128, 142, 156), (40, 48, 58), (186, 192, 198)],
}


def field(w, h, key, seed):
    """A smooth organic tonal field: tiny random image upscaled bicubic."""
    random.seed(seed)
    tones = KEYS[key]
    small = Image.new("RGB", (7, 5))
    px = small.load()
    for y in range(5):
        for x in range(7):
            base = random.choice(tones)
            j = random.randint(-14, 14)
            px[x, y] = tuple(max(0, min(255, c + j)) for c in base)
    im = small.resize((w, h), Image.BICUBIC)
    return im.filter(ImageFilter.GaussianBlur(radius=max(w, h) / 90))


def shapes(im, key, seed):
    """Soft out-of-focus masses, so the image has a subject rather than a wash."""
    random.seed(seed + 7)
    w, h = im.size
    layer = Image.new("RGB", (w, h))
    mask = Image.new("L", (w, h), 0)
    ld, md = ImageDraw.Draw(layer), ImageDraw.Draw(mask)
    tones = KEYS[key]
    for _ in range(random.randint(2, 4)):
        cx, cy = random.uniform(.15, .85) * w, random.uniform(.15, .85) * h
        r = random.uniform(.14, .34) * min(w, h)
        box = [cx - r, cy - r * random.uniform(.7, 1.5), cx + r, cy + r * random.uniform(.7, 1.5)]
        tone = random.choice(tones)
        if random.random() < .35:
            ld.rectangle(box, fill=tone); md.rectangle(box, fill=random.randint(60, 150))
        else:
            ld.ellipse(box, fill=tone); md.ellipse(box, fill=random.randint(60, 150))
    blur = max(w, h) / 26
    return Image.composite(layer.filter(ImageFilter.GaussianBlur(blur)),
                           im, mask.filter(ImageFilter.GaussianBlur(blur)))


def vignette(im, strength=26):
    w, h = im.size
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).ellipse([-w * .18, -h * .18, w * 1.18, h * 1.18], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(max(w, h) / 7))
    dark = ImageEnhance.Brightness(im).enhance(1 - strength / 100)
    return Image.composite(im, dark, m)


def grain(im, sigma=7):
    w, h = im.size
    n = Image.effect_noise((w, h), sigma).convert("RGB")
    return ImageChops.blend(im, ImageChops.overlay(im, n), .22)


def make(w, h, key, seed):
    im = field(w, h, key, seed)
    im = shapes(im, key, seed)
    im = vignette(im)
    im = grain(im)
    return ImageEnhance.Contrast(im).enhance(1.06)


# A deliberate spread of tonal keys, so the page is stress-tested against
# heavy images and airy ones rather than one comfortable middle grey.
COVERS = [("litigation-graphics", "dark"), ("brand-act", "light"), ("brand-world", "warm"),
          ("clarity", "mid"), ("motion", "dark"), ("hernan", "light"),
          ("carolina", "cool"), ("loch", "mid")]
WIDE = ["dark", "light", "mid", "warm", "light", "dark", "mid", "cool", "light"]
TALL = ["light", "mid", "dark", "light", "warm", "mid", "dark", "light", "cool", "mid"]

made = set()
n = 0
for name, key in COVERS:
    make(1200, 900, key, hash(name) % 9999).save(OUT / f"{name}-cover.jpg", quality=80, optimize=True, progressive=True); made.add(f"{name}-cover.jpg"); n += 1
for i, key in enumerate(WIDE):
    make(1800, 1125, key, 400 + i * 31).save(OUT / f"wide-{chr(97+i)}.jpg", quality=80, optimize=True, progressive=True); made.add(f"wide-{chr(97+i)}.jpg"); n += 1
for i, key in enumerate(TALL):
    make(1000, 1250, key, 900 + i * 47).save(OUT / f"tall-{chr(97+i)}.jpg", quality=80, optimize=True, progressive=True); made.add(f"tall-{chr(97+i)}.jpg"); n += 1
stale = [f for f in OUT.iterdir() if f.is_file() and f.name not in made]
for f in stale:
    try:
        f.unlink()
    except OSError:
        pass
print(f"{n} placeholders -> {OUT}" + (f"  ({len(stale)} stale removed)" if stale else ""))
