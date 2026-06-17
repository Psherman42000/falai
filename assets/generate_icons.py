from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))

ACCENT = (124, 92, 255)
SURFACE = (20, 25, 35)


def rounded_rect(draw, xy, radius, fill):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def draw_f(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size // 8
    rounded_rect(draw, (pad, pad, size - pad, size - pad), size // 5, SURFACE + (255,))

    # Desenha um F branco centralizado.
    font_size = int(size * 0.55)
    try:
        font = ImageFont.truetype("segoeui.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    text = "F"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.03
    draw.text((x, y), text, font=font, fill=(255, 255, 255, 230))
    return img


def main():
    for name, size in [("icon_16.png", 16), ("icon_32.png", 32), ("icon_48.png", 48), ("icon_256.png", 256)]:
        img = draw_f(size)
        img.save(os.path.join(HERE, name))
        print(f"Generated {name}")

    # ICO para o instalador/app (256x256 mínimo).
    draw_f(256).save(os.path.join(HERE, "icon.ico"), format='ICO')
    print("Generated icon.ico")


if __name__ == "__main__":
    main()
