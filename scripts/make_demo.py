"""Generate an original, public-domain melody example; requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[1]
font_path = Path("C:/Windows/Fonts/arial.ttf")
font = ImageFont.truetype(str(font_path), 36) if font_path.exists() else ImageFont.load_default(size=36)
image = Image.new("RGB", (1040, 440), "white")
draw = ImageDraw.Draw(image)
draw.text((40, 22), "Twinkle, Twinkle, Little Star", font=font, fill="#24352e")
small = ImageFont.truetype(str(font_path), 20) if font_path.exists() else ImageFont.load_default(size=20)
draw.text((40, 78), "1=C    4/4    Quarter note = 90", font=small, fill="#5b6c5d")
rows = [
    "1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 -",
    "5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 -",
    "1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 -",
]
for i, row in enumerate(rows):
    draw.text((40, 143 + i * 84), row, font=font, fill="black")
image.save(ROOT / "web" / "demo.png")
print("Created web/demo.png")
