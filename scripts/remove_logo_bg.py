"""Remove solid black background from CursoDown logos and rebuild icon.ico."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def remove_black_bg(im: Image.Image, hard: int = 22, soft: int = 40) -> Image.Image:
	im = im.convert("RGBA")
	px = im.load()
	w, h = im.size
	for y in range(h):
		for x in range(w):
			r, g, b, a = px[x, y]
			# Near-black + low chroma -> transparent (keep blue glows)
			mx = max(r, g, b)
			mn = min(r, g, b)
			chroma = mx - mn
			if mx <= hard and chroma <= 12:
				px[x, y] = (r, g, b, 0)
			elif mx < soft and chroma <= 18:
				alpha = int(round(255 * (mx - hard) / max(1, soft - hard)))
				px[x, y] = (r, g, b, min(a, max(0, min(255, alpha))))
	return im


def save_png(src: Path, dst: Path, size: tuple[int, int] | None = None) -> Image.Image:
	im = remove_black_bg(Image.open(src))
	if size:
		im = im.resize(size, Image.Resampling.LANCZOS)
	dst.parent.mkdir(parents=True, exist_ok=True)
	im.save(dst, "PNG")
	print(f"OK {dst} {im.size} mode={im.mode}")
	return im


def main() -> None:
	src = ROOT / "src" / "renderer" / "assets" / "logo.png"
	if not src.exists():
		src = ROOT / "app" / "assets" / "images" / "logo.png"

	# Work from a copy in memory first so we don't read a half-written file
	original = ROOT / "_logo_src_tmp.png"
	Image.open(src).save(original, "PNG")

	save_png(original, ROOT / "src" / "renderer" / "assets" / "logo.png")
	save_png(original, ROOT / "app" / "assets" / "images" / "logo.png")
	save_png(original, ROOT / "app" / "assets" / "images" / "logo64.png", size=(64, 64))

	icon_png = ROOT / "app" / "assets" / "images" / "build" / "icon.png"
	icon = save_png(original, icon_png)

	sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
	icon_rgba = icon.convert("RGBA")
	side = max(icon_rgba.size)
	canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
	ox = (side - icon_rgba.size[0]) // 2
	oy = (side - icon_rgba.size[1]) // 2
	canvas.paste(icon_rgba, (ox, oy), icon_rgba)
	icons = [canvas.resize(s, Image.Resampling.LANCZOS) for s in sizes]
	ico_path = ROOT / "app" / "assets" / "images" / "build" / "icon.ico"
	icons[-1].save(ico_path, format="ICO", sizes=sizes, append_images=icons[:-1])
	print(f"OK {ico_path}")

	original.unlink(missing_ok=True)

	for p in [ROOT / "src" / "renderer" / "assets" / "logo.png", icon_png]:
		im = Image.open(p).convert("RGBA")
		corners = [
			im.getpixel((0, 0)),
			im.getpixel((im.width - 1, 0)),
			im.getpixel((0, im.height - 1)),
		]
		print(p.name, "corners alpha:", [c[3] for c in corners])


if __name__ == "__main__":
	main()
