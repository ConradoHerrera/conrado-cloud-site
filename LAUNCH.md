# Launch checklist — conrado.cloud

Audit run 16 Sep 2026 on `dist/`.

## Stopped before it shipped

**The résumé PDF is not linked, and should not be.**
`Conrado_Herrera_CV_2026.pdf` names *"the Zillow and Redfin litigation"* — real DOAR
matters — and would have sat on a public, crawlable URL. It also carries your phone
number, is headed "INFORMATION & PRESENTATION DESIGN", and lists Presentation Design,
Art Direction, PowerPoint and Keynote under skills, all of which contradict what the
site says about you. If you want a résumé on the site later it has to be a separate,
scrubbed, advertising-facing version. Keep the current one for applications you send
yourself.

## Fixed

- Instagram link removed (it pointed at `instagram.com/` with no handle).
- `green-mountain` set to `live:false` — it was live but orphaned, and the year is
  still a window.
- Favicon, apple-touch-icon, and a 1200x630 social card at `assets/og.png`. Without it
  every link you share previews blank.
- Canonical URL, `og:url`, `og:image`, `twitter:card`, dark theme-color.
- `robots.txt` + `sitemap.xml` on the public build. The preview build gets
  `Disallow: /` so your working view can never be indexed.
- `.htaccess` with 301 redirects from the four old WordPress permalinks.
- **No-JS fallback.** The scroll-reveal CSS hid everything at `opacity:0`; if the
  JavaScript had failed to load, visitors would have seen a blank page. Now the reveal
  only applies when JS is confirmed running.

## Verified

No broken internal links. No horizontal overflow at 375px. Only external link is
LinkedIn. Public build: 4 pages, 1 in Selected Work.

## Deploy

1. In Terminal, from this folder:

       rm -rf dist && python3 build.py

   Do this every time before uploading. My shell can't delete files, so `dist/`
   collects stale ones between runs.

2. Back up the WordPress site, then move or remove it from the web root.

3. Upload the **contents** of `dist/` — not the folder itself — to the web root.

4. Check `conrado.cloud/sitemap.xml` loads, and that an old URL such as
   `conrado.cloud/loch-marketing/` redirects to the new page.

## Preview locally

    python3 -m http.server 8765 --directory dist-preview

then open `localhost:8765`. Never open `index.html` directly as a file — `file://`
blocks the self-hosted webfonts, and you end up reviewing type in the wrong typeface.
