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


# The homepage is a pinned WebGL scene: script moves the content, sections are 200-500vh
# tall, and phrases fade in by scroll progress. None of that runs (or helps) in a review
# frame, so for review the same markup is laid out as one flat, fully visible document.
HOME_REVIEW = """
/* review overrides: homepage */
#meadow,.scrim,.stage,.spacer,.year,.playhead{display:none!important}
.layer,.clipper,.scroller{position:static!important;inset:auto!important;overflow:visible!important;transform:none!important}
.pin{position:static!important;height:auto!important;transform:none!important;padding-block:2.5rem}
.s-about,.s-exp,.s-tools,.s-contact{height:auto!important}
.s-hero{min-height:0!important;margin-bottom:3rem!important;padding-top:3rem!important}
.s-hero .hero__foot{margin-bottom:0!important}
.s-work{padding-top:2rem!important;padding-bottom:3rem!important}
.pin__label,.s-about .pin__label{position:static!important;opacity:1!important;margin-bottom:1.5rem}
.beats{position:static!important;margin-block:0 3.5rem}
.beats__big,.beats__big>span,.beats__body,[data-in],[data-out]{opacity:1!important;transform:none!important;filter:none!important}
.beats__big>span{display:inline!important}
.s-exp .section__head>*{position:static!important;opacity:1!important;pointer-events:auto}
.s-exp .section__head{padding-top:0!important}
.tl__row,.tl__bar{opacity:1!important;transform:none!important;scale:1 1!important}
.s-tools .pin{display:block!important;padding-bottom:2rem}
.contact-stage{position:static!important;display:block!important;text-align:left!important;padding-block:2rem}
.contact-center .links{justify-content:flex-start!important}
.m-foot{position:static!important;height:auto!important;white-space:normal!important;padding-top:2rem}
.nav{position:static!important;order:-1;padding:1rem var(--pad,1.5rem)!important}
body{display:flex!important;flex-direction:column}
.m-foot{padding-inline:var(--pad,1.5rem)}
"""

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

def css_inlined(home=False):
    css = (DIST / "assets" / "css" / "site.css").read_text(encoding="utf-8")
    if home:
        css += "\n" + (DIST / "assets" / "css" / "home.css").read_text(encoding="utf-8")
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
    if home:
        css += HOME_REVIEW
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

import sys
if "--index-only" in sys.argv:
    page = build(DIST / "index.html")
    page["css"] = css_inlined(home=True)   # self-contained: the homepage needs home.css too
    out = ROOT / "review-index.json"
    out.write_text(json.dumps({"index": page}, ensure_ascii=False), encoding="utf-8")
    print(f"index -> {out} ({out.stat().st_size/1e6:.2f} MB)")
    sys.exit(0)

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
