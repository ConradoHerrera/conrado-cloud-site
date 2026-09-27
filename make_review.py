#!/usr/bin/env python3
"""Bundle the built site into one JSON of self-contained pages, for the review artifact.

Every page becomes a standalone HTML document with the stylesheet, the webfonts and
every image inlined as data URIs, so the review tool can render the real pages with
no network at all. Videos are replaced by their poster frame.
"""
import base64, io, json, re, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).parent
DIST = ROOT / "dist"
MAXW, QUALITY = 1100, 55

def b64(data, mime):
    return f"data:{mime};base64," + base64.b64encode(data).decode()

_img_cache = {}
def img_uri(rel):
    if rel in _img_cache:
        return _img_cache[rel]
    f = DIST / "assets" / "img" / rel
    if not f.exists():
        _img_cache[rel] = ""
        return ""
    im = Image.open(f)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    if im.width > MAXW:
        im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    _img_cache[rel] = b64(buf.getvalue(), "image/jpeg")
    return _img_cache[rel]

def css_inlined():
    css = (DIST / "assets" / "css" / "site.css").read_text(encoding="utf-8")
    def font(m):
        f = DIST / "assets" / "fonts" / m.group(1)
        return f'url("{b64(f.read_bytes(), "font/woff2")}")' if f.exists() else m.group(0)
    css = re.sub(r'url\("\.\./fonts/([^"]+)"\)', font, css)
    # Review render: no fixed chrome, no hidden-until-scrolled content, no cursor peek.
    css += """
/* review overrides */
.veil,.tools,.peek{display:none!important}
.nav{position:static!important;mix-blend-mode:normal!important;color:var(--ink)!important}
html{scroll-behavior:auto!important}
[data-anim],.js [data-anim]{opacity:1!important;transform:none!important}
.reveal-words .w>span{transform:none!important;opacity:1!important}
.clip__ui{display:none!important}
"""
    return css

def build(path):
    html = path.read_text(encoding="utf-8")
    body = html.split("<body>", 1)[1].rsplit("</body>", 1)[0]
    body = re.sub(r"<script\b[^>]*>.*?</script>", "", body, flags=re.S)
    # video -> its poster frame
    def vid(m):
        tag = m.group(0)
        po = re.search(r'poster="[^"]*assets/img/([^"]+)"', tag)
        src = img_uri(po.group(1)) if po else ""
        return f'<img src="{src}" alt="" data-was-video="1">' if src else ""
    body = re.sub(r"<video\b[^>]*>\s*</video>", vid, body)
    body = re.sub(r"<video\b[^>]*>", vid, body)
    # images -> inline
    def im(m):
        rel = m.group(1)
        u = img_uri(rel)
        return f'src="{u}"' if u else 'src="" data-missing="1"'
    body = re.sub(r'src="(?:\.\./)*assets/img/([^"]+)"', im, body)
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    return {
        "title": (title.group(1) if title else path.stem).split(" \u2014 ")[0],
        "body": body,
    }

CSS = css_inlined()
pages = {}
order = [("index", DIST / "index.html")]
for f in sorted((DIST / "work").glob("*.html")):
    order.append((f.stem, f))
for slug, f in order:
    pages[slug] = build(f)
    print(f"  {slug:22s} {len(pages[slug]['body'])/1e6:5.2f} MB")

out = ROOT / "review-pages.json"
out.write_text(json.dumps({"css": CSS, "pages": pages}, ensure_ascii=False), encoding="utf-8")
print(f"\ntotal {out.stat().st_size/1e6:.2f} MB -> {out}")
