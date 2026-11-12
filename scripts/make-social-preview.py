#!/usr/bin/env python3
"""Generate the 1280x640 social preview / README banner.

Development helper only: the PNG is committed, so nothing in the build or
release pipeline depends on Python or Pillow.

Usage:
    python3 scripts/make-social-preview.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:  # pragma: no cover - dev helper
    sys.exit("Pillow is required to regenerate the preview image")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets" / "social-preview.png"
ICON = ROOT / "icons" / "icon128.png"

W, H = 1280, 640
LATIN_BOLD = "/System/Library/Fonts/Helvetica.ttc"
CJK = "/System/Library/Fonts/Hiragino Sans GB.ttc"

WHITE = (255, 255, 255)


def background() -> Image.Image:
    # Tiny gradient scaled up: cheap, smooth, and avoids extra dependencies.
    steps = 64
    start = (10, 14, 30)
    end = (76, 29, 149)
    small = Image.new("RGBA", (steps, steps))
    pixels = small.load()
    for y in range(steps):
        for x in range(steps):
            t = min(1.0, 0.58 * (x / (steps - 1)) + 0.42 * (y / (steps - 1)))
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(start, end)) + (255,)
    image = small.resize((W, H), Image.BICUBIC)

    # Soft purple glow near the pulse decoration.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((760, 90, 1320, 620), fill=(124, 58, 237, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    return Image.alpha_composite(image, glow)


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size, index=index)


def draw_pulse(layer: Image.Image) -> None:
    """Low-contrast ECG line filling the right half."""
    draw = ImageDraw.Draw(layer, "RGBA")
    points = [
        (700, 330),
        (800, 330),
        (840, 400),
        (880, 205),
        (930, 355),
        (1010, 330),
        (1240, 330),
    ]
    draw.line(points, fill=(255, 255, 255, 38), width=7, joint="curve")
    for point in points:
        draw.ellipse((point[0] - 5, point[1] - 5, point[0] + 5, point[1] + 5), fill=(255, 255, 255, 46))


def chip(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, text_font: ImageFont.FreeTypeFont) -> int:
    padding = 18
    height = 38
    width = int(draw.textlength(label, font=text_font)) + padding * 2
    draw.rounded_rectangle((x, y, x + width, y + height), radius=19, fill=(255, 255, 255, 28), outline=(255, 255, 255, 60), width=1)
    draw.text((x + padding, y + height / 2), label, font=text_font, fill=(255, 255, 255, 220), anchor="lm")
    return width


def build() -> Image.Image:
    image = background()

    # Icon with a soft drop shadow.
    icon = Image.open(ICON).convert("RGBA").resize((132, 132), Image.LANCZOS)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((88, 84, 88 + 132, 84 + 132), radius=30, fill=(0, 0, 0, 140))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    image = Image.alpha_composite(image, shadow)
    image.alpha_composite(icon, (88, 84))

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")

    eyebrow_font = font(LATIN_BOLD, 19, index=1)
    title_font = font(LATIN_BOLD, 92, index=1)
    subtitle_font = font(CJK, 40, index=2)
    tagline_font = font(CJK, 27, index=0)
    chip_font = font(CJK, 21, index=0)
    url_font = font(LATIN_BOLD, 23, index=0)

    draw.text((88, 246), "C H R O M E   /   E D G E   ·   M A N I F E S T   V 3", font=eyebrow_font, fill=(255, 255, 255, 135))
    draw.text((88, 276), "PagePulse", font=title_font, fill=(255, 255, 255, 255))
    draw.text((88, 398), "页脉 · 随机保活刷新", font=subtitle_font, fill=(199, 190, 255, 255))
    draw.text((88, 466), "让页面保持呼吸，按随机节奏刷新", font=tagline_font, fill=(226, 232, 240, 210))

    x = 88
    for label in ["Chrome / Edge", "多站点独立", "纯本地 · 无追踪", "Manifest V3"]:
        x += chip(draw, x, 530, label, chip_font) + 12

    draw.text(
        (W - 88, 600),
        "github.com/breeze86/page-pulse",
        font=url_font,
        fill=(203, 213, 225, 170),
        anchor="rs",
    )

    image = Image.alpha_composite(image, layer)

    pulse_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_pulse(pulse_layer)
    pulse_layer = pulse_layer.filter(ImageFilter.GaussianBlur(1.5))
    return Image.alpha_composite(image, pulse_layer)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({W}x{H})")


if __name__ == "__main__":
    main()
