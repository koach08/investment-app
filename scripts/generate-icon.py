#!/usr/bin/env python3
"""Generate app icon: green circle with white $ sign → .icns"""

import subprocess
import tempfile
import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow not installed. Run: pip3 install Pillow")
    exit(1)

SCRIPT_DIR = Path(__file__).parent
OUTPUT_ICNS = SCRIPT_DIR / "AppIcon.icns"
SIZE = 1024

# Create image
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Green circle background
padding = 20
draw.ellipse(
    [padding, padding, SIZE - padding, SIZE - padding],
    fill=(34, 197, 94),  # green-500
)

# White $ sign
font_size = 680
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
except (OSError, IOError):
    font = ImageFont.load_default()

bbox = draw.textbbox((0, 0), "$", font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]
x = (SIZE - text_w) / 2 - bbox[0]
y = (SIZE - text_h) / 2 - bbox[1]
draw.text((x, y), "$", fill="white", font=font)

# Save PNG and convert to .icns via iconutil
with tempfile.TemporaryDirectory() as tmpdir:
    iconset = os.path.join(tmpdir, "AppIcon.iconset")
    os.makedirs(iconset)

    # Generate required sizes
    for size in [16, 32, 64, 128, 256, 512, 1024]:
        resized = img.resize((size, size), Image.LANCZOS)
        resized.save(os.path.join(iconset, f"icon_{size}x{size}.png"))
        if size <= 512:
            double = img.resize((size * 2, size * 2), Image.LANCZOS)
            double.save(os.path.join(iconset, f"icon_{size}x{size}@2x.png"))

    subprocess.run(
        ["iconutil", "-c", "icns", iconset, "-o", str(OUTPUT_ICNS)],
        check=True,
    )

print(f"Icon generated: {OUTPUT_ICNS}")
