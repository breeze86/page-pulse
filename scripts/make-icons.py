#!/usr/bin/env python3
"""Generate PagePulse icons (16/32/48/128) from a simple vector-ish drawing.

Development helper only: the PNGs are committed, so building/packaging the
extension never depends on Python or Pillow.

Usage:
    python3 scripts/make-icons.py [output_dir]
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover - dev helper
    sys.exit("Pillow is required to regenerate icons: pip install Pillow")

SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 4

TOP_LEFT = (99, 102, 241)     # indigo-500
BOTTOM_RIGHT = (124, 58, 237)  # violet-600
WHITE = (255, 255, 255, 255)


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def gradient(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = 0.55 * (x / (size - 1)) + 0.45 * (y / (size - 1))
            pixels[x, y] = (
                lerp(TOP_LEFT[0], BOTTOM_RIGHT[0], t),
                lerp(TOP_LEFT[1], BOTTOM_RIGHT[1], t),
                lerp(TOP_LEFT[2], BOTTOM_RIGHT[2], t),
                255,
            )
    return image


def pulse_points(size: int) -> list[tuple[float, float]]:
    normalized = [
        (0.15, 0.54),
        (0.37, 0.54),
        (0.45, 0.72),
        (0.54, 0.27),
        (0.63, 0.54),
        (0.85, 0.54),
    ]
    return [(x * size, y * size) for x, y in normalized]


def draw_pulse(draw: ImageDraw.ImageDraw, size: int, color, width: int, offset: float = 0.0) -> None:
    points = [(x, y + offset) for x, y in pulse_points(size)]
    draw.line(points, fill=color, width=width, joint="curve")
    radius = width / 2
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def render(size: int) -> Image.Image:
    """Draw at 4x then downsample so small sizes keep a legible stroke."""
    canvas_size = size * SUPERSAMPLE
    canvas = gradient(canvas_size)

    mask = Image.new("L", (canvas_size, canvas_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, canvas_size - 1, canvas_size - 1),
        radius=int(canvas_size * 0.23),
        fill=255,
    )
    icon = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    icon.paste(canvas, (0, 0), mask)

    draw = ImageDraw.Draw(icon, "RGBA")
    # Slightly bolder stroke at 16/32px keeps the pulse readable in the toolbar.
    ratio = 0.105 if size <= 32 else 0.08
    width = max(4, round(canvas_size * ratio))

    # Soft shadow under the pulse for depth.
    draw_pulse(draw, canvas_size, (35, 20, 120, 70), width, offset=canvas_size * 0.012)
    draw_pulse(draw, canvas_size, WHITE, width)

    return icon.resize((size, size), Image.LANCZOS)


def main() -> None:
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "icons")
    output.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        target = output / f"icon{size}.png"
        render(size).save(target, "PNG", optimize=True)
        print(f"wrote {target} ({size}x{size})")


if __name__ == "__main__":
    main()
