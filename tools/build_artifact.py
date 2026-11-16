"""Builds the single-page Artifact (claude.ai) from web/: page markup + inlined CSS.

The JS modules are published next to the page as-is, with web/artifact/api.js taking the
place of web/js/api.js (see README, "Versão artefato").

Typeface: the Artifact cannot load the Adobe Fonts kit the server version uses, so when the
licensed Urbane files are present in web/fonts/ (kept out of the repository) they are embedded
in the page. Without them the page falls back to Montserrat, as the brand manual allows.
"""
from base64 import b64encode
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FONTS = [("urbane-light.ttf", 300), ("urbane-medium.ttf", 500), ("urbane-demibold.ttf", 600)]

html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
css = (ROOT / "web" / "css" / "styles.css").read_text(encoding="utf-8")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1).strip()

faces = ""
if all((ROOT / "web" / "fonts" / name).exists() for name, _ in FONTS):
    for name, weight in FONTS:
        data = b64encode((ROOT / "web" / "fonts" / name).read_bytes()).decode()
        faces += (
            f'@font-face {{ font-family: "urbane"; font-weight: {weight}; font-style: normal; font-display: swap; '
            f'src: url(data:font/ttf;base64,{data}) format("truetype"); }}\n'
        )
    font_link = ""
else:
    font_link = (
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Montserrat:wght@400;500;600;700&display=swap">\n'
    )

page = f"<title>Escritório Virtual LFTM</title>\n{font_link}<style>\n{faces}{css}</style>\n{body}\n"
out = ROOT / "dist" / "artifact"
out.mkdir(parents=True, exist_ok=True)
(out / "escritorio-virtual.html").write_text(page, encoding="utf-8")
print(out / "escritorio-virtual.html", f"({len(page) // 1024} KB, Urbane embedded: {bool(faces)})")
