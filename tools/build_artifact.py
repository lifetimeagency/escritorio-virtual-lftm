"""Builds the single-page Artifact (claude.ai) from web/: page markup + inlined CSS.

The JS modules are published next to the page as-is, with web/artifact/api.js taking the
place of web/js/api.js (see README, "Versão artefato").
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
css = (ROOT / "web" / "css" / "styles.css").read_text(encoding="utf-8")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1).strip()
page = (
    "<title>Escritório Virtual LFTM</title>\n"
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">\n'
    f"<style>\n{css}</style>\n{body}\n"
)
out = ROOT / "dist" / "artifact"
out.mkdir(parents=True, exist_ok=True)
(out / "escritorio-virtual.html").write_text(page, encoding="utf-8")
print(out / "escritorio-virtual.html")
