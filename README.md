# conrado.cloud

Hand-built static site. No framework, no dependencies, no build step at deploy.
Live build is ~134 KB including self-hosted fonts.

```
python3 build.py
```

### Which file to open

**`dist-preview/index.html` — this is your working view.** All five pieces
including the four you haven't made yet, every brief, and the placeholder
imagery. This is the one to look at while you work.

`dist/index.html` is the public site: finished work only, no briefs, no
placeholder art. It's what you upload, and it will look sparse until the new
pieces land. That's correct — it's the honest state of the portfolio today.

`build.py` prints the full path to both every time it runs, plus a checklist of
anything still using placeholder art. When that list is empty, the site is done.

### Two flags per project

| flag        | what it does                                                          |
| ----------- | --------------------------------------------------------------------- |
| `"live"`    | finished — appears in the public build at all                          |
| `"feature"` | appears in **Selected Work** on the homepage                           |

Litigation Graphics and the four new pieces are featured. Carolina Razo, Hernan
Prada and LOCH are live but **not** featured — their pages exist and are reached
by clicking the role in the experience timeline, which keeps the index a
showcase instead of a work history.

---

## The vocabulary rule

`data/site.json` holds `disciplines_canonical` — six words:

> Information Design · Litigation Graphics · Motion ·
> Brand Identity · Generative AI · 3D

Data Visualisation was retired into Information Design, which already covers it,
and Motion Design became Motion so that "design" does not repeat down the line.

**A project may only tag itself with words from that list.** The build refuses to
stay quiet about violations. And the words shown on the site — the header list and
the marquee — are *derived from the projects that are actually live*. A word does
not appear on conrado.cloud until a piece proves it.

That's the answer to "can we add the words as the projects land": you don't add
them anywhere. You tag the project, and the site updates itself.

Same seven words on the CV and LinkedIn. Titles are what you were paid to be;
disciplines are what the work required. Never mix the two.

---

## Adding a project

1. Images into `assets/img/`.
2. Copy an entry in `data/projects.json`.
3. Tag it only with canonical words. Set `"live": true` when it's finished.
4. `python3 build.py`.

Section kinds: `text`, `figure`, `pair`, `note`, and `brief`.

**`brief` never appears in `dist/`.** It's your working instructions — what to
make, the deliverables, the hours, the bar it has to clear — visible only in
`dist-preview/`. Every unfinished piece has one.

---

## Placeholders

`make_placeholders.py` (needs Pillow) generates abstract images with real
photographic weight — grain, depth, vignette — across a deliberate spread of
tonal keys: heavy dark ones, airy light ones, two with colour. The point is to
stress-test the layout against the images you'll actually put in it, not against
one comfortable grey.

They're original generated fields, so nothing copyrighted ever sits in the
project folder, and they're excluded from `dist/` entirely. Drop your own images
into `assets/img/` and point `projects.json` at them whenever you like — the
build picks them up and the warning for that project disappears.

Delete the script and the folder once every project has real images.

---

## Before this goes public

1. **Add your CV** — `assets/conrado-herrera-cv.pdf` is linked but missing.
2. **Fix the Instagram URL** in `data/site.json`.
3. **Client links** — `carolinarazo.com` is in. Add Hernán Prada and LOCH if
   there's anything worth linking to.
4. **Confirm the AI tools line.** It currently says "Claude, Generative image
   tools". Name the actual image models you use.
5. **Never publish real case material on the Evidence page.** Not redacted, not
   sanitised. Invented matters only. The page says so in print.

---

## Structure

```
site/
├── build.py                 generator + all templates + the vocabulary lint
├── make_placeholders.py     temporary — delete when real images land
├── data/
│   ├── site.json            identity, bio, experience (LinkedIn is the truth), tools
│   └── projects.json        every project, every brief
├── assets/
│   ├── css/site.css         one file
│   ├── js/site.js           no dependencies
│   ├── fonts/               Inter Tight variable + Instrument Serif (88 KB)
│   └── img/
├── dist/                    ← upload this
└── dist-preview/            ← your working view
```

The experience section is a real timeline — bars positioned by actual dates,
gradient-filled, the current role in accent and fading at its right edge because
it hasn't ended. Each role links to its project page. It demonstrates the
discipline instead of claiming it.
