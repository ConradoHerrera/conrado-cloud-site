#!/usr/bin/env python3
"""
conrado.cloud static site builder.

    python3 build.py

Outputs two folders:
    dist/          live work only, placeholder imagery suppressed  -> upload this
    dist-preview/  everything: unfinished pieces, briefs, placeholder imagery

The discipline words shown on the site are DERIVED from the projects that are
actually live. A word does not appear until a piece proves it. The canonical
list in data/site.json is the only vocabulary a project may tag itself with.

No dependencies. Python 3.8+.
"""
import json, re, shutil, html
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"
SITE = json.loads((DATA / "site.json").read_text(encoding="utf-8"))
PROJECTS = sorted(json.loads((DATA / "projects.json").read_text(encoding="utf-8")),
                  key=lambda p: p.get("order", 99))
CANON = SITE["disciplines_canonical"]

# Cache stamp on every stylesheet and script. The markup and the CSS change
# together (a class rename is useless if a browser keeps yesterday's CSS), so
# they are versioned together. Bump this whenever assets/css or assets/js change.
ASSET_V = "202610010310"

E = lambda s: html.escape(str(s), quote=True)
warnings = []


# ---------------------------------------------------------------- vocabulary
def derive_disciplines(projects):
    """The words the site is allowed to say, in canonical order, earned by live work."""
    used = {d for p in projects for d in p["disciplines"]}
    return [d for d in CANON if d in used]


def lint():
    # The scene is compiled by hand (esbuild, see wip/hero-stage-b/README.md), so
    # nothing here can rebuild it. If the source has been edited since the bundle
    # was last built, the page ships new markup against an engine that does not
    # understand it, and the change silently does nothing. Say so, loudly.
    src = ROOT / "wip" / "hero-stage-b" / "src" / "main.js"
    bundle = ROOT / "assets" / "js" / "meadow.js"
    if src.exists() and bundle.exists() and src.stat().st_mtime > bundle.stat().st_mtime + 60:
        warnings.append("assets/js/meadow.js is older than wip/hero-stage-b/src/main.js "
                        "— rebuild it with esbuild before deploying")
    for p in PROJECTS:
        for d in p["disciplines"]:
            if d not in CANON:
                warnings.append(f"{p['slug']}: '{d}' is not in the canonical vocabulary")


# ---------------------------------------------------------------- chrome
def head(title, desc, depth=0, path=""):
    up = "../" * depth
    base = "https://" + SITE["domain"]
    canon = base + "/" + (path[:-5] if path.endswith(".html") else path)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script>document.documentElement.classList.add("js");setTimeout(function(){{if(!window.__ready)document.documentElement.classList.remove("js")}},2500);</script>
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<meta name="theme-color" content="#EFEDE7">
<meta name="theme-color" media="(prefers-color-scheme:dark)" content="#14171A">
<link rel="canonical" href="{E(canon)}">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{E(canon)}">
<meta property="og:image" content="{E(base)}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{up}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{up}assets/apple-touch-icon.png">
<link rel="preload" href="{up}assets/fonts/inter-tight-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{up}assets/css/site.css?v={ASSET_V}">
</head>
<body>"""


def nav(depth=0):
    up = "../" * depth
    return f"""<div class="veil" aria-hidden="true">
  <div class="veil__b1"></div><div class="veil__b2"></div>
  <div class="veil__b3"></div><div class="veil__b4"></div>
  <div class="veil__tint"></div>
</div>
<nav class="nav mono">
  <a class="nav__brand" href="{up}index.html">{E(SITE['name'])}</a>
  <div class="nav__links">
    <a href="{up}index.html#work">Work</a>
    <a href="{up}index.html#about">About</a>
    <a href="{up}index.html#contact">Contact</a>
  </div>
  <span class="nav__clock" data-clock></span>
</nav>"""


SUN = '<svg class="ico ico--sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1"/><g stroke-linecap="round"><path d="M8 .9v2M8 13.1v2M.9 8h2M13.1 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13"/></g></svg>'
MOON = '<svg class="ico ico--moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.4 9.8A5.8 5.8 0 0 1 6.2 2.6a5.9 5.9 0 1 0 7.2 7.2Z"/></svg>'


def tools_bar():
    return (f'<div class="tools"><button type="button" data-theme-toggle aria-label="Switch theme">'
            f'{SUN}{MOON}</button></div>')


def foot(depth=0):
    up = "../" * depth
    return f"""<footer class="foot wrap mono dim">
  <span>&copy; 2026 {E(SITE['name'])}</span>
  <span>{E(SITE['location'])}</span>
  <span>{E(SITE['domain'])}</span>
</footer>
<script src="{up}assets/js/site.js?v={ASSET_V}" defer></script>
</body></html>"""


# ---------------------------------------------------------------- media
def grid_cls(cols):
    """A media grid's classes. The column count is a class, not an inline
    custom property, so the narrow breakpoints can collapse 3 and 4 columns to
    2 and then to 1 while a one-column section (a full-width film) stays one."""
    n = max(1, min(4, int(cols)))
    return f"cs__grid cs__grid--c{n}"


def plate(label):
    return f'<div class="plate"><span>{E(label)}</span></div>'


def media(src, label, depth=0, allow_placeholder=True, where=""):
    if not src:
        return plate(label)
    if src.startswith("placeholders/") and not allow_placeholder:
        warnings.append(f"{where}: still using placeholder art ({src})")
        return plate(label)
    if not (ROOT / "assets" / "img" / src).exists():
        warnings.append(f"{where}: image not found — add assets/img/{src}")
        return plate(label)
    up = "../" * depth
    return f'<img src="{up}assets/img/{E(src)}" alt="{E(label)}" loading="lazy" decoding="async">'


# ---------------------------------------------------------------- timeline
def timeline(page_slugs=()):
    ax = SITE["axis"]; span = ax["to"] - ax["from"]
    pct = lambda v: (v - ax["from"]) / span * 100
    ticks = "".join(
        f'<span class="tl__tick" style="left:{pct(t):.2f}%">{t}</span>' for t in ax["ticks"])
    rows = []
    for r in SITE["experience"]:
        left, width = pct(r["start"]), pct(r["end"]) - pct(r["start"])
        if r.get("current"):
            width = 100 - left   # ongoing: to the end of the axis, tail faded
        org = (f'<a href="{E(r["url"])}" target="_blank" rel="noopener">{E(r["org"])} &#8599;</a>'
               if r.get("url") else E(r["org"]))
        proj = r.get("project")
        role = (f'<a class="tl__go" href="work/{E(proj)}.html">{E(r["role"])}</a>'
                if proj and proj in page_slugs else E(r["role"]))
        cur = " is-current" if r.get("current") else ""
        place = f' · {E(r["place"])}' if r.get("place") else ""
        rows.append(f"""<div class="tl__row">
      <div class="tl__label">
        <p class="tl__role">{role}</p>
        <p class="mono dim">{org}{place}</p>
        <p class="mono dim tl__dates">{E(r['from'])} — {E(r['to'])}</p>
      </div>
      <div class="tl__track">
        <span class="tl__bar{cur}" style="left:{left:.2f}%;width:{width:.2f}%"></span>
      </div>
      <p class="tl__note muted">{E(r['note'])}</p>
    </div>""")
    return ('<div class="tl" data-anim>'
            '<div class="tl__axis mono dim"><span></span>'
            f'<div class="tl__scale">{ticks}</div>'
            '<span></span></div>'
            f'{"".join(rows)}</div>')


# ---------------------------------------------------------------- home
def build_index(projects, preview):
    page_slugs = {p['slug'] for p in projects}
    disciplines = derive_disciplines(projects)
    shown = [p for p in projects if p.get('feature')]
    rows, peeks = [], []
    for i, p in enumerate(shown, 1):
        tag = "" if p["live"] else '<span class="tag-soon">In production</span>'
        disc = "".join(f"<span>{E(d)}</span>" for d in p["disciplines"])
        rows.append(f"""<article class="index__row" data-peek="{E(p['slug'])}" data-anim>
      <a class="index__link" href="work/{E(p['slug'])}.html"><span class="sr-only">{E(p['title'])}</span></a>
      <p class="index__num">N.{i:02d}</p>
      <h3 class="index__title">{E(p['title'])}{tag}</h3>
      <div class="index__disc">{disc}</div>
    </article>""")
        peeks.append(f'<div class="peek__item" data-peek="{E(p["slug"])}">'
                     f'{media(p.get("cover"), p["title"], 0, preview, p["slug"]+" cover")}</div>')

    marquee = "".join(f"<em>{E(d)}</em>" for d in disciplines)
    about = "".join(f'<p class="body-lg" data-anim>{E(t)}</p>' for t in SITE["about"])
    edu = "".join(f'<div class="deflist__row"><span class="mono dim">{E(r["year"])}</span>'
                  f'<span>{E(r["what"])}</span></div>' for r in SITE["education"])
    tools = "".join(f'<div class="tool__group"><p class="mono dim">{E(g["group"])}</p>'
                    f'<p class="mono">{E(", ".join(g["items"]))}</p></div>' for g in SITE["tools"])
    links = "".join(
        f'<a href="{E(l["url"])}"{" target=_blank rel=noopener" if l["url"].startswith("http") else ""}>{E(l["label"])}</a>'
        for l in SITE["links"])

    return f"""{head(SITE['name'] + ' — ' + SITE['identity'], SITE['lede'])}
{nav()}
<div class="peek" aria-hidden="true"><div class="peek__inner">{''.join(peeks)}</div></div>
<main>

<header class="hero wrap">
  <div class="hero__meta mono">
    <span>{E(SITE['name'])} &mdash; {E(SITE['identity'])}</span>
  </div>
  <div class="hero__statement">
    <h1 class="display reveal-words" data-split>{E(SITE['headline'])}</h1>
  </div>
  <div class="hero__foot">
    <div><p class="lede" data-anim>{E(SITE['lede'])}</p></div>
    <div data-anim><p class="mono dim">Disciplines</p><p class="mono">{E(' / '.join(disciplines))}</p></div>
    <div data-anim><p class="mono dim">Contact</p><p class="mono"><a href="mailto:{E(SITE['email'])}">{E(SITE['email'])}</a></p></div>
  </div>
</header>

<section class="section wrap" id="work">
  <div class="section__head">
    <h2 class="mono dim">Selected work</h2>
    <p class="mono dim">{len(shown):02d} projects</p>
  </div>
  <div class="index">{''.join(rows)}</div>
</section>

<div class="marquee" aria-hidden="true"><div class="marquee__track">{marquee}</div></div>

<section class="section wrap" id="about">
  <div class="section__head"><h2 class="mono dim">About</h2></div>
  <div class="cols" style="padding-top:clamp(2rem,5vw,4rem)">
    <div class="col-7">
      <h3 class="h-lg" data-anim style="padding-bottom:clamp(1.5rem,3vw,2.5rem)">I'm Conrado. I design <span class="serif-it">identity</span>, <span class="serif-it">information</span> and <span class="serif-it">motion</span> &mdash; usually all three at once.</h3>
      {about}
    </div>
  </div>

  <div style="padding-top:clamp(3rem,7vw,6rem)">
    <p class="mono dim" style="padding-bottom:1.5rem">Experience</p>
    {timeline(page_slugs)}
  </div>

  <div class="cols" style="padding-top:clamp(3rem,6vw,5rem)">
    <div class="col-5">
      <p class="mono dim" style="padding-bottom:1rem">Education</p>
      <div class="deflist">{edu}</div>
    </div>
    <div class="col-6 at-right-6">
      <p class="mono dim" style="padding-bottom:1rem">Tools</p>
      <div class="tool__grid">{tools}</div>
    </div>
  </div>
</section>

<section class="section wrap" id="contact">
  <div class="section__head"><h2 class="mono dim">Contact</h2></div>
  <div style="padding-top:clamp(2.5rem,6vw,5rem)">
    <a class="contact__mail" href="mailto:{E(SITE['email'])}" data-anim>{E(SITE['email'])}</a>
    <div class="links mono" style="padding-top:clamp(2rem,4vw,3rem)" data-anim>{links}</div>
  </div>
</section>

</main>
{tools_bar()}
{foot()}"""


# ---------------------------------------------------------------- homepage
# The homepage is the "hero-stage-b" scene: one three.js meadow drawn inside a
# window that is pinned to the screen and changes shape per section, with the
# page scrolling over it. The contract lives in wip/hero-stage-b/HANDOFF.md, and
# the comments inside each section below are part of it: the shapes, camera
# shots and magnetic stops are keyed off data-shot, so section order, ids and
# class names matter. Everything except the chrome is generated from
# data/site.json and data/projects.json, so adding a project is a data edit.
#
# After changing wip/hero-stage-b/src/main.js:
#   npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 \
#     --outfile=meadow.js
# then copy meadow.js to assets/js/ and bump ASSET_V below.

def home_rows(projects):
    """Selected Work: one .index__row per featured project, in order.

    Keep the inner structure (.index__num, .index__title with an optional
    .tag-soon, .index__disc): meadow.js measures these. The row count is free;
    the window, the snapping and the camera steps adapt to it.
    """
    shown = [p for p in projects if p.get("feature")]
    out = []
    for i, p in enumerate(shown, 1):
        tag = "" if p["live"] else '<span class="tag-soon">In production</span>'
        # A finished piece gets a full-row link to its case study; an
        # unfinished one has nothing to link to yet.
        link = (f'<a class="index__link" href="work/{E(p["slug"])}.html"'
                f' aria-label="{E(p["title"])}"></a>') if p["live"] else ""
        # A row titled "Litigation Graphics" does not need "Litigation Graphics"
        # again as its first tag; the other words are the ones doing work there.
        disc = "".join(f"<span>{E(d)}</span>" for d in p["disciplines"]
                       if d.lower() != p["title"].lower())
        out.append(f'<article class="index__row" tabindex="0">{link}'
                   f'<p class="index__num">N.{i:02d}</p>'
                   f'<h3 class="index__title">{E(p["title"])}{tag}</h3>'
                   f'<div class="index__disc">{disc}</div></article>')
    return len(shown), "\n        ".join(out)


def home_timeline(projects):
    """Experience: positions are fractions of the axis, as HANDOFF.md defines.

        frac(year) = (year - from) / (to - from)

    Each row carries data-row; each bar carries data-l and data-w plus the same
    values as left/width percentages, because meadow.js animates from the
    attributes and the CSS has to be right before it runs.
    """
    ax = SITE["axis"]
    span = ax["to"] - ax["from"]
    frac = lambda v: (v - ax["from"]) / span
    page_slugs = {p["slug"] for p in projects}
    ticks = "".join(f'<span class="tl__tick" style="left:{frac(t)*100:.2f}%">{t}</span>'
                    for t in ax["ticks"])
    rows = []
    for r in SITE["experience"]:
        l, w = frac(r["start"]), frac(r["end"]) - frac(r["start"])
        # A role that has not ended runs to the end of the axis; its tail fades
        # out, so the shape says "still going" without needing a date to read.
        if r.get("current"):
            w = 1 - l
        cur = " is-current" if r.get("current") else ""
        role = E(r["role"])
        if r.get("project") in page_slugs:
            role = f'<a class="tl__go" href="work/{E(r["project"])}.html">{role}</a>'
        place = " · ".join(x for x in (r["org"], r.get("place")) if x)
        rows.append(
            f'<div class="tl__row" data-row="{l:.4f}">'
            f'<div class="tl__label"><p class="tl__role">{role}</p>'
            f'<p class="mono dim">{E(place)}</p>'
            f'<p class="mono dim tl__dates">{E(r["from"])} — {E(r["to"])}</p></div>'
            f'<div class="tl__track"><span class="tl__bar{cur}" data-bar '
            f'data-l="{l:.4f}" data-w="{w:.4f}" '
            f'style="left:{l*100:.2f}%;width:{w*100:.2f}%"></span></div>'
            f'<p class="tl__note muted">{E(r.get("note", ""))}</p></div>')
    first = ax["ticks"][0]
    return (
        f'<div class="section__head" data-snap><h2 class="mono dim">Experience</h2>'
        f'<p class="mono dim">{first} — Present</p></div>\n'
        f'      <p class="year" data-year aria-hidden="true" data-in="0.03" data-out="0.96">{first}</p>\n'
        f'      <div class="tl" data-from="{ax["from"]}" data-to="{ax["to"]}">\n'
        f'        <div class="tl__axis mono dim"><span></span>'
        f'<div class="tl__scale">{ticks}<i class="playhead" data-playhead></i></div>'
        f'<span></span></div>\n        '
        + "\n        ".join(rows) + "\n      </div>")


def build_home(projects, preview):
    n, rows = home_rows(projects)
    disciplines = " / ".join(derive_disciplines(projects))
    edu = "".join(f'<li><span class="mono dim">{E(r["year"])}</span>'
                  f'<span>{E(r["what"])}</span></li>' for r in SITE["education"])
    tools = "".join(f'<div><dt class="mono dim">{E(g["group"])}</dt>'
                    f'<dd>{E(", ".join(g["items"]))}</dd></div>' for g in SITE["tools"])
    links = "".join(
        f'<a href="{E(l["url"])}"{" target=_blank rel=noopener" if l["url"].startswith("http") else ""}>{E(l["label"])}</a>'
        for l in SITE["links"])
    about = SITE["about"]
    # The big line in About's second beat is the first two sentences of
    # about[1], set in type with the serif italics, so it stays in the markup.
    # The paragraph under it is whatever is left of about[1], plus about[2].
    rest = re.split(r"(?<=\.)\s+", about[1])[2:]
    beat2 = " ".join(rest + [about[2]]).strip()
    base = "https://" + SITE["domain"]
    title = SITE["name"] + " — " + SITE["identity"]
    robots = '\n<meta name="robots" content="noindex">' if preview else ""

    return f"""<!doctype html>
<!--
  conrado.cloud — homepage ("hero-stage-b"). GENERATED by build.py: edit
  data/site.json, data/projects.json, assets/css/home.css or the scene source in
  wip/hero-stage-b/, never this file. READ wip/hero-stage-b/HANDOFF.md before
  changing any of them. Short version:
  · One 3D meadow (assets/js/meadow.js, built from wip/hero-stage-b/src/main.js) is drawn inside a
    single "window" that is pinned to the screen and changes shape per section. Every
    <section data-shot="..."> picks the window shape and camera shot for itself (windowFor / SHOTS).
  · All text lives in .layer[data-layer=ink]. A script at the bottom clones it into a "light" layer
    that only shows inside the window (white text over the scene). Duplicate ids in the clone are
    expected; never target the clone.
  · Adding/removing projects: edit data/projects.json. The window, snapping and camera steps adapt
    to the number of rows.
  · Browsers without WebGL are sent to index-static.html, the same content laid out as a plain page.
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(SITE['lede'])}">{robots}
<script>
  // set the theme before anything paints (same key as the rest of the site, so the choice carries over)
  (function () {{ var t = new URLSearchParams(location.search).get('theme');
    try {{ t = t || localStorage.getItem('cc-theme'); }} catch (e) {{}}
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); }})();
  // This page scrolls by script: the scene moves the content, so with no WebGL there is nothing to
  // fall back to in place. Those visitors get the plain build of the same homepage instead.
  (function () {{
    var ok = false;
    try {{
      var c = document.createElement('canvas');
      ok = !!(window.WebGLRenderingContext &&
              (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    }} catch (e) {{ ok = false; }}
    if (!ok) location.replace('index-static.html' + location.hash);
  }})();
</script>
<noscript><meta http-equiv="refresh" content="0;url=index-static.html"></noscript>
<meta name="theme-color" content="#EFEDE7">
<meta name="theme-color" media="(prefers-color-scheme:dark)" content="#14171A">
<link rel="canonical" href="{base}/">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(SITE['lede'])}">
<meta property="og:type" content="website">
<meta property="og:url" content="{base}/">
<meta property="og:image" content="{base}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preload" href="assets/fonts/inter-tight-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/site.css?v={ASSET_V}">
<link rel="stylesheet" href="assets/css/home.css?v={ASSET_V}">
</head>
<body>
<canvas id="meadow" aria-hidden="true"></canvas>

<div class="layer" data-layer="ink">
  <div class="scrim" data-scrim="about" aria-hidden="true"></div>
  <div class="scrim scrim--center" data-scrim="contact" data-scrim-in="0.34" aria-hidden="true"></div>
  <div class="clipper"><div class="scroller" data-scroller>
  <main id="top">

  <!-- HERO. The window opens as the headline band, then (magnetic stop) closes around .hero__foot.
       .hero__foot must keep its three children: lede · disciplines · contact. -->
  <header class="s-hero wrap" data-shot="garden">
    <div class="hero__meta mono"><span>{E(SITE['name'])} &mdash; {E(SITE['identity'])}</span></div>
    <h1 class="display">{E(SITE['headline'])}</h1>
    <div class="hero__foot">
      <div><p class="lede">{E(SITE['lede'])}</p></div>
      <div><p class="mono dim">Disciplines</p><p class="mono">{E(disciplines)}</p></div>
      <div><p class="mono dim">Contact</p><p class="mono"><a href="mailto:{E(SITE['email'])}">{E(SITE['email'])}</a></p></div>
    </div>
  </header>

  <!-- SELECTED WORK. One <article class="index__row"> per featured project, generated from
       data/projects.json. The window becomes the card nearest the middle of the screen (or the
       hovered/tapped one); each card is a magnetic stop; the camera climbs one step per card
       toward About's first view. -->
  <section class="s-work wrap" id="work" data-shot="view">
    <div class="col">
      <div class="section__head" data-snap><h2 class="mono dim">Selected work</h2><p class="mono dim">{n:02d} project{'' if n == 1 else 's'}</p></div>
      <div class="index">
        {rows}
      </div>
    </div>
  </section>

  <!-- ABOUT. Pinned (520vh). Each phrase appears at data-in (0–1 progress through the section) and
       leaves at data-out. The camera and light are keyed to the same progress (ABOUT_KEYS):
       0–0.5 still frame over the field (first passage), 0.53+ golden light (second passage),
       0.84–1 glide into the Experience frame. Rewording is safe; keep phrases inside those ranges.
       The two body paragraphs come from site.json → about. -->
  <section class="s-about" id="about" data-shot="about" data-pinned data-menu-at="0.44" data-label="About">
    <div class="pin wrap" data-pin>
      <p class="mono dim pin__label" data-snap>About</p>
      <div class="beats">
        <h3 class="h-lg beats__big">
          <span data-in="0" data-out="0.5">I'm Conrado.</span>
          <span data-in="0.10" data-out="0.5">I design <span class="serif-it">identity</span>,</span>
          <span data-in="0.17" data-out="0.5"><span class="serif-it">information</span></span>
          <span data-in="0.23" data-out="0.5">and <span class="serif-it">motion</span> &mdash;</span>
          <span data-in="0.31" data-out="0.5">usually all three at once.</span>
        </h3>
        <p class="body-lg beats__body" data-in="0.39" data-out="0.5">{E(about[0])}</p>
      </div>
      <div class="beats">
        <p class="h-lg beats__big"><span data-in="0.55">Marketing taught me how to make someone <span class="serif-it">care</span>.</span>
          <span data-in="0.64">Litigation taught me how to make someone <span class="serif-it">understand</span>.</span></p>
        <p class="body-lg beats__body" data-in="0.8">{E(beat2)}</p>
      </div>
    </div>
  </section>

  <!-- EXPERIENCE. Pinned (360vh); a playhead runs the axis and a whole day passes in the sky.
       Rows, bars and ticks are computed from site.json → experience and axis. The big year (.year)
       sizes itself to the room under the list (--year-size, set in meadow.js). -->
  <section class="s-exp" data-shot="track" data-pinned data-exit="left" data-label="Experience" data-meta="{SITE['axis']['ticks'][0]} &mdash; Present">
    <div class="pin wrap" data-pin>
      {home_timeline(projects)}
    </div>
  </section>

  <!-- EDUCATION & TOOLS. A pinned stage like the others: the block holds in the middle of the
       left column, opposite the window, and arrives and leaves from the left there instead of
       riding up the page. The shot itself is static, so the pin costs the camera nothing. -->
  <section class="s-tools" data-shot="tools" data-pinned data-hold="both">
    <div class="pin wrap" data-pin>
    <div class="col et" data-snap data-sync="shot" data-slide="left">
      <div class="et__block">
        <p class="mono dim et__label">Education</p>
        <ul class="et__edu">{edu}</ul>
      </div>
      <div class="et__block">
        <p class="mono dim et__label">Tools</p>
        <dl class="et__tools">{tools}</dl>
      </div>
    </div>
    </div>
  </section>

  <!-- CONTACT. Last section. data-lead: the story starts half a screen before it pins (camera already
       sinking into the grass); data-snap-end: the page settles on its final frame, and nav #contact
       goes there. -->
  <section class="s-contact" id="contact" data-shot="contact" data-pinned data-lead="0.5" data-snap-end>
    <div class="pin" data-pin>
      <div class="contact-stage">
        <div class="contact-center">
          <a class="contact__mail" href="mailto:{E(SITE['email'])}" data-in="0.34">{E(SITE['email'])}</a>
          <div class="links mono" data-in="0.42">{links}</div>
        </div>
      </div>
      <footer class="m-foot mono dim"><span>&copy; 2026 {E(SITE['name'])}</span><span>{E(SITE['location'])}</span></footer>
    </div>
  </section>

  </main>
  </div></div>
</div>
<div class="spacer" data-spacer></div>
<div class="veil" aria-hidden="true">
  <div class="veil__b1"></div><div class="veil__b2"></div>
  <div class="veil__b3"></div><div class="veil__b4"></div>
  <div class="veil__tint"></div>
</div>
<nav class="nav mono">
  <a class="nav__brand" href="#top">{E(SITE['name'])}</a>
  <div class="nav__links"><a href="#work">Work</a><a href="#about">About</a><a href="#contact">Contact</a></div>
  <span class="nav__clock" data-clock></span>
</nav>

<!-- Where you are. Inside the window this name sits on grass or sky and
     disappears; in the band under the window it is always ink on paper. It
     cross-fades between sections rather than scrolling, because the window it
     labels does not move either. The headings it stands in for are still in the
     markup, so screen readers and the scroll snapping are unaffected. -->
<div class="stage mono dim" data-stage aria-hidden="true"><span data-stage-name></span><span data-stage-meta></span></div>

<div class="tools"><button type="button" data-theme-toggle aria-label="Switch to night"><svg class="ico ico--sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1"/><g stroke-linecap="round"><path d="M8 .9v2M8 13.1v2M.9 8h2M13.1 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13"/></g></svg><svg class="ico ico--moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.4 9.8A5.8 5.8 0 0 1 6.2 2.6a5.9 5.9 0 1 0 7.2 7.2Z"/></svg></button></div>

<script>
  // the light copy: identical content, white, visible only inside the window
  (function () {{
    var ink = document.querySelector('[data-layer="ink"]');
    var light = ink.cloneNode(true);
    light.dataset.layer = 'light';
    light.classList.add('layer--light');
    light.setAttribute('aria-hidden', 'true');
    light.querySelectorAll('[id]').forEach(function (e) {{ e.removeAttribute('id'); }});
    light.querySelectorAll('a,[tabindex]').forEach(function (e) {{ e.setAttribute('tabindex', '-1'); }});
    ink.after(light);
  }})();
  (function tick(){{var t=new Date().toLocaleTimeString('en-US',{{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/New_York'}})+' NY';
    document.querySelectorAll('[data-clock]').forEach(function(el){{el.textContent=t;}});setTimeout(tick,15000);}})();
</script>
<script src="assets/js/meadow.js?v={ASSET_V}" defer></script>
</body>
</html>"""


# ---------------------------------------------------------------- case study
def build_case(p, projects, i, preview):
    shown = [x for x in projects if x.get("feature")] or projects
    # Cycle through the featured ring; if that ring is too small to move (one
    # finished piece), fall back to every live project so "next" is never self.
    ring = shown if len(shown) > 1 else projects
    nxt = ring[(ring.index(p) + 1) % len(ring)] if p in ring else ring[0]
    if nxt is p:
        alt = [x for x in projects if x is not p]
        nxt = alt[0] if alt else p
    blocks = []
    for s in p["sections"]:
        k = s["kind"]
        if k == "brief":
            if not preview:
                continue
            items = "".join(f"<li>{E(x)}</li>" for x in s.get("list", []))
            blocks.append(f"""<div class="brief" data-anim>
      <p class="mono brief__tag">{E(s.get('head','Your brief'))} &mdash; preview only, never published</p>
      <p class="body-lg">{E(s['body'])}</p>
      <ul class="brief__list mono">{items}</ul>
    </div>""")
        elif k == "text":
            blocks.append(f"""<div class="cols" style="padding-block:clamp(1.25rem,3vw,2.5rem)">
      <div class="col-4"><p class="mono dim">{E(s.get('head',''))}</p></div>
      <div class="col-7"><p class="body-lg" data-anim>{E(s['body'])}</p></div>
    </div>""")
        elif k == "note":
            label = (f'<span class="cs__note__label mono">{E(s["label"])}</span>'
                     if s.get("label") else "")
            blocks.append(f"""<div class="cols" style="padding-block:clamp(1.25rem,3vw,2.5rem)">
      <div class="col-4"></div>
      <div class="col-7"><div class="cs__note" data-anim>{label}<p>{E(s['body'])}</p></div></div>
    </div>""")
        elif k == "points":
            items = "".join(
                f'<li><p class="mono dim">{E(it.get("label", ""))}</p>'
                f'<p>{E(it.get("body", ""))}</p></li>'
                for it in s.get("items", []))
            blocks.append(f"""<div class="cols" style="padding-block:clamp(1.25rem,3vw,2.5rem)">
      <div class="col-4"><p class="mono dim">{E(s.get('head',''))}</p></div>
      <div class="col-7" data-anim><ul class="points">{items}</ul></div>
    </div>""")
        elif k == "seealso":
            # Cross-link to another project page, for work that belongs beside this
            # one but has no place of its own in the experience timeline.
            blocks.append(f"""<div class="cols" style="padding-block:clamp(1.5rem,4vw,3rem)">
      <div class="col-4"><p class="mono dim">{E(s.get('head',''))}</p></div>
      <div class="col-7" data-anim>
        <p class="body-lg" style="max-width:46ch">{E(s.get('body',''))}</p>
        <p style="padding-top:.9rem"><a class="seealso__link mono" href="{E(s['to'])}.html">{E(s.get('label','See the project'))} &rarr;</a></p>
      </div>
    </div>""")
        elif k == "figure":
            # ratio: show the art at its own proportions instead of cropping it into
            # one of the standard frames. narrow: hold it to a readable column.
            fcls = ("frame" + (" frame--tall" if s.get("tall") else "")
                    + (" frame--ratio" if s.get("ratio") else ""))
            fatt = f' data-fit="{E(s["fit"])}"' if s.get("fit") else ""
            if s.get("ratio"):
                fatt += f' style="--ar:{E(s["ratio"])}"'
            figcls = "cs__figure" + (" cs__figure--narrow" if s.get("narrow") else "")
            blocks.append(f"""<figure class="{figcls}" data-anim>
      <div class="{fcls}"{fatt}>{media(s.get('src'), s.get('caption', p['title']), 1, preview, p['slug'])}</div>
      <figcaption class="mono dim"><span>{E(s.get('caption',''))}</span></figcaption>
    </figure>""")
        elif k == "youtube":
            # Facade: only a thumbnail until clicked, so the page loads nothing from
            # YouTube (and sets no cookies) unless someone actually wants to watch.
            tiles = "".join(
                f'<button class="yt" type="button" data-yt="{E(v["id"])}" '
                f'aria-label="Play {E(v["title"])}">'
                f'<img src="https://i.ytimg.com/vi/{E(v["id"])}/hqdefault.jpg" alt="" '
                f'loading="lazy" decoding="async">'
                f'<span class="yt__play" aria-hidden="true"></span>'
                f'<span class="yt__t mono">{E(v["title"])}</span></button>'
                for v in s.get("videos", []))
            blocks.append(f"""<figure class="cs__figure" data-anim>
      <div class="{grid_cls(s.get('cols', 2))}">{tiles}</div>
      <figcaption class="mono dim"><span>{E(s.get('caption',''))}</span></figcaption>
    </figure>""")
        elif k == "video":
            up = "../"
            srcs = s.get("src") if isinstance(s.get("src"), list) else [s.get("src")]
            srcs = [v for v in srcs if v]
            posters = s.get("poster") if isinstance(s.get("poster"), list) else [s.get("poster")]
            posters += [None] * (len(srcs) - len(posters))
            ar = s.get("aspect", "9/16")
            if s.get("controls"):
                mode = ' controls preload="metadata"'
            elif s.get("playonce"):
                # Builds that play once when scrolled to, then hold the last frame.
                mode = ' muted playsinline preload="auto" data-playonce'
            else:
                mode = ' muted loop playsinline autoplay preload="metadata"'
            # SF Symbols supplied by Conrado: info.circle, info.circle.fill, arrow.clockwise.
            SVG = ('<svg viewBox="{vb}" fill="currentColor" aria-hidden="true" '
                   'class="ic {cls}">{d}</svg>')
            P_INFO = ('<path d="M9.95469 19.9094C15.4553 19.9094 19.9197 15.4553 19.9197 9.95469'
                      'C19.9197 4.45408 15.4553 0 9.95469 0C4.46443 0 0 4.45408 0 9.95469'
                      'C0 15.4553 4.46443 19.9094 9.95469 19.9094ZM9.95469 18.2559'
                      'C5.36575 18.2559 1.66174 14.5436 1.66174 9.95469C1.66174 5.36575 5.36575 1.6535 '
                      '9.95469 1.6535C14.5436 1.6535 18.2559 5.36575 18.2559 9.95469'
                      'C18.2559 14.5436 14.5436 18.2559 9.95469 18.2559Z"/>'
                      '<path d="M7.73051 15.2996L12.6273 15.2996C13.0273 15.2996 13.3423 15.0115 13.3423 '
                      '14.6053C13.3423 14.2219 13.0273 13.9214 12.6273 13.9214L11.0098 13.9214L11.0098 '
                      '9.0754C11.0098 8.54711 10.7466 8.20513 10.243 8.20513L7.8921 8.20513C7.5045 '
                      '8.20513 7.18745 8.50571 7.18745 8.88084C7.18745 9.28492 7.5045 9.57514 7.8921 '
                      '9.57514L9.45152 9.57514L9.45152 13.9214L7.73051 13.9214C7.33045 13.9214 7.02586 '
                      '14.2219 7.02586 14.6053C7.02586 15.0115 7.33045 15.2996 7.73051 15.2996ZM9.86153 '
                      '6.69958C10.6059 6.69958 11.1948 6.10456 11.1948 5.37057C11.1948 4.62412 10.6059 '
                      '4.03523 9.86153 4.03523C9.12754 4.03523 8.53654 4.62412 8.53654 5.37057C8.53654 '
                      '6.10456 9.12754 6.69958 9.86153 6.69958Z"/>')
            P_INFO_FILL = ('<path d="M19.9197 9.95469C19.9197 15.4407 15.4511 19.9094 9.95469 19.9094'
                           'C4.46866 19.9094 0 15.4407 0 9.95469C0 4.46866 4.46866 0 9.95469 0'
                           'C15.4511 0 19.9197 4.46866 19.9197 9.95469ZM7.8921 8.20513C7.47345 8.20513 '
                           '7.14605 8.51606 7.14605 8.90978C7.14605 9.32632 7.47345 9.6269 7.8921 '
                           '9.6269L9.48046 9.6269L9.48046 14.0973L7.70981 14.0973C7.30975 14.0973 6.9741 '
                           '14.4083 6.9741 14.802C6.9741 15.2164 7.30975 15.5273 7.70981 15.5273L12.7722 '
                           '15.5273C13.1722 15.5273 13.5079 15.2164 13.5079 14.802C13.5079 14.4083 '
                           '13.1722 14.0973 12.7722 14.0973L11.0926 14.0973L11.0926 9.1168C11.0926 '
                           '8.56781 10.8169 8.20513 10.3051 8.20513ZM8.53654 5.28777C8.53654 6.04246 '
                           '9.14824 6.66853 9.91328 6.66853C10.6887 6.66853 11.2879 6.04246 11.2879 '
                           '5.28777C11.2879 4.51237 10.6887 3.89032 9.91328 3.89032C9.14824 3.89032 '
                           '8.53654 4.51237 8.53654 5.28777Z"/>')
            P_REPLAY = ('<path d="M8.62177 20.9826C13.3895 20.9826 17.2435 17.1161 17.2435 12.3505'
                        'C17.2435 11.9133 16.8851 11.5652 16.4603 11.5652C16.0334 11.5652 15.675 11.9133 '
                        '15.675 12.3505C15.675 16.2458 12.5171 19.3912 8.62177 19.3912C4.72642 19.3912 '
                        '1.57069 16.2458 1.57069 12.3505C1.57069 8.45515 4.72642 5.29731 8.62177 5.29731'
                        'C9.49081 5.29731 10.3161 5.44514 11.0853 5.73847C11.5847 5.93744 12.1772 5.65144 '
                        '12.1856 5.04246C12.1919 4.5412 11.8254 4.36273 11.5578 4.26726C10.6604 3.92218 '
                        '9.66296 3.73908 8.62177 3.73908C3.85616 3.73908 0 7.59313 0 12.3608C0 17.1161 '
                        '3.85616 20.9826 8.62177 20.9826ZM11.2701 4.90981L7.71383 8.427C7.55837 8.57211 '
                        '7.49204 8.77932 7.49204 8.98041C7.49204 9.42378 7.8298 9.76365 8.2588 9.76365'
                        'C8.50953 9.76365 8.68358 9.67662 8.82447 9.54397L12.8465 5.5008C13.0189 5.32635 '
                        '13.0977 5.13773 13.0977 4.9077C13.0977 4.69626 13.0064 4.48694 12.8465 4.32706'
                        'L8.82658 0.242488C8.68569 0.0994872 8.50339 0 8.25669 0C7.82769 0 7.49204 '
                        '0.362676 7.49204 0.806048C7.49204 1.01748 7.55837 1.22259 7.70348 1.3677Z"/>')
            I_INFO = ('<span class="clip__ic">'
                      + SVG.format(vb="0 0 19.9197 19.9094", cls="ic--a", d=P_INFO)
                      + SVG.format(vb="0 0 19.9197 19.9094", cls="ic--b", d=P_INFO_FILL)
                      + '</span>')
            I_REPLAY = ('<span class="clip__ic clip__ic--tall">'
                        + SVG.format(vb="0 0 17.2435 20.9826", cls="ic--a", d=P_REPLAY)
                        + '</span>')

            def clip_ui():
                """Replay, over the clip. The description is no longer hidden behind a
                hover: it sits under the piece, where it can be read at a glance."""
                return ('<div class="clip__ui">'
                        '<button class="clip__btn clip__btn--replay" type="button" '
                        f'aria-label="Play again">{I_REPLAY}</button></div>'
                        ) if s.get("playonce") else ""

            notes = s.get("notes") if isinstance(s.get("notes"), list) else [s.get("notes")]
            notes += [None] * (len(srcs) - len(notes))
            clips = "".join(
                '<div class="cs__cell">'
                f'<div class="cs__clip" style="--ar:{E(ar)}">'
                f'<video src="{up}assets/img/{E(v)}"'
                + (f' poster="{up}assets/img/{E(po)}"' if po else "")
                + mode + '></video>' + clip_ui() + '</div>'
                + (f'<p class="clip__note">{E(tx)}</p>' if tx else '')
                + '</div>'
                for v, po, tx in zip(srcs, posters, notes))
            vcls = "cs__figure" + (" cs__figure--narrow" if s.get("narrow") else "")
            blocks.append(f"""<figure class="{vcls}" data-anim>
      <div class="{grid_cls(s.get('cols', len([v for v in srcs if v]) or 1))}">{clips}</div>
      <figcaption class="mono dim"><span>{E(s.get('caption',''))}</span></figcaption>
    </figure>""")
        elif k == "grid":
            tiles = "".join(
                f'<div class="frame frame--sq">{media(x, s.get("caption", p["title"]), 1, preview, p["slug"])}</div>'
                for x in (s.get("src") or []))
            cols = s.get("cols", 3)
            blocks.append(f"""<figure class="cs__figure" data-anim>
      <div class="{grid_cls(cols)}">{tiles}</div>
      <figcaption class="mono dim"><span>{E(s.get('caption',''))}</span></figcaption>
    </figure>""")
        elif k == "pair":
            a, b = (s.get("src") or [None, None])[:2]
            blocks.append(f"""<figure class="cs__figure" data-anim>
      <div class="cs__pair">
        <div class="frame frame--tall">{media(a, s.get('caption', p['title']), 1, preview, p['slug'])}</div>
        <div class="frame frame--tall">{media(b, s.get('caption', p['title']), 1, preview, p['slug'])}</div>
      </div>
      <figcaption class="mono dim"><span>{E(s.get('caption',''))}</span></figcaption>
    </figure>""")

    disc = " / ".join(p["disciplines"])
    role_html = ("<br>".join(E(r) for r in p["role"])
                 if isinstance(p["role"], list) else E(p["role"]))
    tag = "" if p["live"] else '<div style="padding-top:clamp(1.5rem,3vw,2.5rem)"><span class="tag-soon">In production</span></div>'
    site_link = (f'<div><p class="dim">Live</p><p><a href="{E(p["link"])}" target="_blank" rel="noopener">{E(p["link"].split("//")[-1])}</a></p></div>'
                 if p.get("link") else "")
    return f"""{head(p['title'] + ' — ' + SITE['name'], p['summary'], 1, f"work/{p['slug']}.html")}
{nav(1)}
<main>
<header class="cs__hero wrap">
  <p class="mono dim" style="padding-bottom:clamp(1.5rem,3vw,2.5rem)"><a href="../index.html#work">&larr; Index</a>{f' &nbsp;&nbsp; N.{i:02d}' if i else ''}</p>
  <h1 class="display reveal-words" data-split>{E(p['title'])}</h1>
  {tag}
  <div class="cs__meta mono">
    <div><p class="dim">Client</p><p>{E(p['client'])}</p></div>
    <div><p class="dim">Year</p><p>{E(p['year'])}</p></div>
    <div><p class="dim">Disciplines</p><p>{E(disc)}</p></div>
    <div><p class="dim">Role</p><p>{role_html}</p></div>
    {site_link}
  </div>
</header>

<section class="wrap" style="padding-block:clamp(3rem,9vw,8rem)">
  <p class="cs__idea" data-anim>{E(p['idea'])}</p>
</section>

<section class="wrap">
  <div class="cols" style="padding-bottom:clamp(2rem,5vw,4rem)">
    <div class="col-4"><p class="mono dim">Overview</p></div>
    <div class="col-7"><p class="lede" style="max-width:46ch" data-anim>{E(p['summary'])}</p></div>
  </div>
  {''.join(blocks)}
</section>

<section class="wrap">
  <a class="next" href="{E(nxt['slug'])}.html">
    <p class="mono dim" style="padding-bottom:1rem">Next project</p>
    <p class="next__title">{E(nxt['title'])}</p>
  </a>
</section>
</main>
{tools_bar()}
{foot(1)}"""


# ---------------------------------------------------------------- run
def emit(outdir, projects, preview):
    out = ROOT / outdir
    (out / "work").mkdir(parents=True, exist_ok=True)
    # Everything but the image library, which is copied by reference below —
    # so an unused or superseded image never ends up in a build.
    shutil.copytree(ROOT / "assets", out / "assets", dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("img", ".DS_Store"))
    used = set()
    for p in projects:
        if p.get("cover"):
            used.add(p["cover"])
        for s in p["sections"]:
            src = s.get("src")
            if isinstance(src, str):
                used.add(src)
            elif isinstance(src, list):
                used.update(x for x in src if x)
            po = s.get("poster")
            if isinstance(po, str):
                used.add(po)
            elif isinstance(po, list):
                used.update(x for x in po if x)
    copied = 0
    for rel in sorted(used):
        if rel.startswith("placeholders/") and not preview:
            continue
        srcf = ROOT / "assets" / "img" / rel
        if not srcf.exists():
            continue
        dstf = out / "assets" / "img" / rel
        dstf.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(srcf, dstf)
        copied += 1
    # index.html is the scene. index-static.html is the same site as a plain
    # page: it is what a browser without WebGL (or without JavaScript) is sent
    # to, since the scene's script is what scrolls the real homepage. Its nav
    # points at itself so that visitor is not bounced back and forth.
    (out / "index.html").write_text(build_home(projects, preview), encoding="utf-8")
    static = (build_index(projects, preview)
              .replace('href="index.html#', 'href="#')
              .replace('href="index.html"', 'href="index-static.html"'))
    (out / "index-static.html").write_text(static, encoding="utf-8")
    base = "https://" + SITE["domain"]
    if preview:
        (out / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    else:
        (out / "robots.txt").write_text(
            f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", encoding="utf-8")
        (out / "_redirects").write_text(
            "/hernan-prada-hair/*        /work/hernan-prada          301\n"
            "/loch-marketing/*           /work/loch                  301\n"
            "/carolinarazo-com/*         /work/carolina-razo         301\n"
            "/dubin-research-consulting/* /work/litigation-graphics  301\n",
            encoding="utf-8")
        # Old WordPress permalinks -> new pages. Apache only; harmless elsewhere.
        (out / ".htaccess").write_text(
            "Options -Indexes\n"
            "DirectoryIndex index.html index.php\n"
            "RewriteEngine On\n"
            "Redirect 301 /hernan-prada-hair/ /work/hernan-prada.html\n"
            "Redirect 301 /loch-marketing/ /work/loch.html\n"
            "Redirect 301 /carolinarazo-com/ /work/carolina-razo.html\n"
            "Redirect 301 /dubin-research-consulting/ /work/litigation-graphics.html\n",
            encoding="utf-8")
        urls = [""] + [f"work/{p['slug']}" for p in projects]
        body = "".join(f"  <url><loc>{base}/{u}</loc></url>\n" for u in urls)
        (out / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + body + "</urlset>\n", encoding="utf-8")
    shown_list = [x for x in projects if x.get("feature")]
    for p in projects:
        i = shown_list.index(p) + 1 if p in shown_list else 0
        (out / "work" / f"{p['slug']}.html").write_text(
            build_case(p, projects, i, preview), encoding="utf-8")
    keep = {f"{p['slug']}.html" for p in projects}
    for stale in (out / "work").glob("*.html"):
        if stale.name not in keep:
            try:
                stale.unlink()
                print(f"  {'':14s} removed stale page: work/{stale.name}")
            except OSError:
                stale.write_text(
                    '<!doctype html><meta charset="utf-8">'
                    '<meta http-equiv="refresh" content="0;url=../index.html">',
                    encoding="utf-8")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    words = derive_disciplines(projects)
    shown = sum(1 for p in projects if p.get("feature"))
    print(f"  {outdir:14s} {shown} in Selected Work, {len(projects)} pages · {size/1024:.0f} KB")
    print(f"  {'':14s} words earned: {', '.join(words)}")


if __name__ == "__main__":
    lint()
    live = [p for p in PROJECTS if p["live"]]
    print("Building conrado.cloud")
    emit("dist", live, preview=False)
    emit("dist-preview", PROJECTS, preview=True)
    if warnings:
        seen = sorted(set(warnings))
        print(f"\n  {len(seen)} thing(s) to fix before this is finished:")
        for w in seen[:14]:
            print("   ·", w)
        if len(seen) > 14:
            print(f"   · …and {len(seen)-14} more")
    print()
    print("  Your working view — unfinished pieces, briefs, placeholder images:")
    print(f"     open {(ROOT / 'dist-preview' / 'index.html')}")
    print()
    print("  The public site — upload the contents of this folder:")
    print(f"     {(ROOT / 'dist')}")
