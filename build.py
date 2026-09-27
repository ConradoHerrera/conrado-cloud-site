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
import json, shutil, html
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"
SITE = json.loads((DATA / "site.json").read_text(encoding="utf-8"))
PROJECTS = sorted(json.loads((DATA / "projects.json").read_text(encoding="utf-8")),
                  key=lambda p: p.get("order", 99))
CANON = SITE["disciplines_canonical"]

E = lambda s: html.escape(str(s), quote=True)
warnings = []


# ---------------------------------------------------------------- vocabulary
def derive_disciplines(projects):
    """The words the site is allowed to say, in canonical order, earned by live work."""
    used = {d for p in projects for d in p["disciplines"]}
    return [d for d in CANON if d in used]


def lint():
    for p in PROJECTS:
        for d in p["disciplines"]:
            if d not in CANON:
                warnings.append(f"{p['slug']}: '{d}' is not in the canonical vocabulary")


# ---------------------------------------------------------------- chrome
def head(title, desc, depth=0, path=""):
    up = "../" * depth
    base = "https://" + SITE["domain"]
    canon = base + "/" + path
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
<link rel="stylesheet" href="{up}assets/css/site.css">
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
    <a href="mailto:{E(SITE['email'])}">Contact</a>
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
<script src="{up}assets/js/site.js" defer></script>
</body></html>"""


# ---------------------------------------------------------------- media
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
            blocks.append(f"""<figure class="cs__figure" data-anim>
      <div class="frame">{media(s.get('src'), s.get('caption', p['title']), 1, preview, p['slug'])}</div>
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
      <div class="cs__grid" style="--cols:{s.get('cols', 2)}">{tiles}</div>
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
            I_INFO = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
                      'stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.1"/>'
                      '<path d="M12 11.2v5.3"/><path d="M12 7.5h.01"/></svg>')
            I_REPLAY = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
                        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                        '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>')

            def clip_ui(idx, text):
                """Glass controls over the clip: its description on hover, and replay."""
                if not s.get("playonce"):
                    return ""
                pid = f"{p['slug']}-clip-{idx}"
                info = ""
                if text:
                    info = ('<span class="clip__info">'
                            f'<button class="clip__btn" type="button" aria-describedby="{pid}"'
                            f' aria-label="About this piece">{I_INFO}</button>'
                            f'<span class="clip__panel" id="{pid}" role="tooltip">{E(text)}</span>'
                            '</span>')
                return ('<div class="clip__ui">' + info +
                        '<button class="clip__btn clip__btn--replay" type="button" '
                        f'aria-label="Play again">{I_REPLAY}</button></div>')

            notes = s.get("notes") if isinstance(s.get("notes"), list) else [s.get("notes")]
            notes += [None] * (len(srcs) - len(notes))
            clips = "".join(
                f'<div class="cs__clip" style="--ar:{E(ar)}">'
                f'<video src="{up}assets/img/{E(v)}"'
                + (f' poster="{up}assets/img/{E(po)}"' if po else "")
                + mode + '></video>' + clip_ui(n, tx) + '</div>'
                for n, (v, po, tx) in enumerate(zip(srcs, posters, notes), 1))
            blocks.append(f"""<figure class="cs__figure" data-anim>
      <div class="cs__grid" style="--cols:{s.get('cols', len([v for v in srcs if v]) or 1)}">{clips}</div>
      <figcaption class="mono dim"><span>{E(s.get('caption',''))}</span></figcaption>
    </figure>""")
        elif k == "grid":
            tiles = "".join(
                f'<div class="frame frame--sq">{media(x, s.get("caption", p["title"]), 1, preview, p["slug"])}</div>'
                for x in (s.get("src") or []))
            cols = s.get("cols", 3)
            blocks.append(f"""<figure class="cs__figure" data-anim>
      <div class="cs__grid" style="--cols:{cols}">{tiles}</div>
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
    (out / "index.html").write_text(build_index(projects, preview), encoding="utf-8")
    base = "https://" + SITE["domain"]
    if preview:
        (out / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    else:
        (out / "robots.txt").write_text(
            f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", encoding="utf-8")
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
        urls = [""] + [f"work/{p['slug']}.html" for p in projects]
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
