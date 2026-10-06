#!/usr/bin/env python3
"""Derive AVIF and WebP copies of the raster assets.

PNG stays as the final fallback and as the source of truth; the derived files
are regenerated whenever the PNG is newer than they are. Run from build.sh, or
directly: python3 build/images.py
"""
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not installed — skipping image derivation "
          "(pip install pillow pillow-avif-plugin)")
    sys.exit(0)

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# Only the on-page portrait is derived. The social card stays PNG: several
# link unfurlers still do not accept AVIF for og:image.
SOURCES = ["img/mohd-elfie-nieshaem-juferi-portrait.png"]

# Gallery thumbnails, downloaded by build/gallery.mjs, plus anything placed in
# assets/img/ by hand.
for folder in ("img",):
    d = ASSETS / folder
    if d.exists():
        SOURCES += [
            str(Path(folder) / f.name)
            for f in sorted(d.iterdir())
            if f.suffix.lower() in (".jpg", ".jpeg", ".png")
            # The social card stays PNG: several link unfurlers reject AVIF.
            and "card" not in f.name
        ]

written = []
for name in SOURCES:
    src = ASSETS / name
    if not src.exists():
        continue
    for ext, kwargs in (("avif", {"quality": 60}), ("webp", {"quality": 84, "method": 6})):
        out = src.with_suffix("." + ext)
        if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
            continue
        try:
            im = Image.open(src)
            # Gallery thumbnails render at ~190px in a four-up row; 480px
            # covers 2x screens with nothing to spare.
            if name.startswith("img/") and "portrait" not in name and "card" not in name and max(im.size) > 480:
                im.thumbnail((480, 480), Image.LANCZOS)
            # The hero identity-card portrait renders at 96-112px; 320px
            # covers 2x-3x screens with nothing to spare. Previously shipped
            # at the full source resolution (440px) for a ~110px slot.
            elif "portrait" in name and max(im.size) > 320:
                im.thumbnail((320, 320), Image.LANCZOS)
            im.save(out, **kwargs)
            written.append(f"{out.name} ({out.stat().st_size // 1024} KB)")
        except Exception as err:                      # noqa: BLE001
            print(f"Could not write {out.name}: {err}")

print("Images: " + (", ".join(written) if written else "up to date"))
