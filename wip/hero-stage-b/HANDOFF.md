# Homepage (hero-stage-b): handoff notes

For whoever edits this next (human or Claude). Read this before touching `index.html` or `src/main.js`.
`README.md` in this folder is the running changelog; this file is the manual.

## What it is

One 3D meadow (three.js) is drawn inside a single rounded **window** that stays pinned to the screen.
The page scrolls over it. Each section picks the window's shape and a camera shot, and the window
morphs between them. Text inside the window is white; text outside it is ink on paper.

| file | role |
| --- | --- |
| `index.html` | markup + page CSS (on top of the site's `assets/css/site.css`) + two small inline scripts |
| `src/main.js` | the scene, camera shots, window, scroll choreography, day/night (source of truth) |
| `src/dof.js` | depth-of-field pass |
| `meadow.js` | **built** bundle of `src/` (never edit by hand) |

Build after any change to `src/`:

```
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=meadow.js
```

Then bump the `?v=` stamp on `<script src="meadow.js?v=...">` so browsers drop the cached copy.
The bundle is a classic script (IIFE), so the page also works opened straight from disk (`file://`).

## The two text layers (most important gotcha)

All content lives once, in `.layer[data-layer=ink]`. The inline script at the bottom of `index.html`
**clones** it into `.layer--light`, which is clipped to the window, so the same words show white over the
scene and ink on paper, split exactly at the window's edge.

- Edit the ink copy only. Never target the clone; ids appear twice by design.
- Anything interactive inside rows must work from either copy (listeners are bound with
  `querySelectorAll`, and the row index is taken from its position among its siblings).
- Styles meant only for text over the scene go under `.layer--light …`.

## Section contract

Order and ids matter; `src/main.js` knows each section by its `data-shot`.

| section | `data-shot` | window (`windowFor`) | notes |
| --- | --- | --- | --- |
| hero `.s-hero` | `garden` | headline band → closes around `.hero__foot` | `.hero__foot` must keep 3 children: lede · disciplines · contact |
| work `.s-work` | `view` | the selected project card | see "Projects" below |
| about `.s-about` | `about` | full | pinned, 520vh, keyed camera + light |
| experience `.s-exp` | `track` | full | pinned, 360vh, day passes, playhead |
| education & tools `.s-tools` | `tools` | right column (top band on phones) | ends right after its content |
| contact `.s-contact` | `contact` | full | pinned, last section |

Adding a new section means adding a `data-shot` entry in both `windowFor()` and `SHOTS` in `src/main.js`.

### Attributes the script reads

| attribute | where | meaning |
| --- | --- | --- |
| `data-shot="id"` | section | window shape + camera shot for this section |
| `data-pinned` | section | the section's `[data-pin]` stage holds still while the section scrolls (height in CSS = length of the story) |
| `data-pin` | inside a pinned section | the stage that holds still (100vh) |
| `data-in="0.3"` / `data-out="0.5"` | any element in a section | appears / leaves at that progress (0–1) through its section, coming into focus |
| `data-lead="0.5"` | pinned section | the story starts that many screens before the section pins |
| `data-snap` | an element | magnetic stop: the page settles with this element under the nav |
| `data-snap-end` | section | magnetic stop at the section's end; nav links go there too |
| `data-scrim="id"` + `data-scrim-in` | `.scrim` in the ink layer | soft shade shown only in the window, tied to that pinned section's presence (and, optionally, its progress) |
| `data-theme-toggle` | button | day/night; stores `cc-theme` in localStorage (same key as the live site), sets `html[data-theme]` |

Section lengths (`height: 520vh` etc.) *are* the pacing of the pinned stories. Change them deliberately.

## Projects (Selected Work): expect frequent edits

Add, remove or reorder `<article class="index__row">` inside `.s-work .index`. **Any count works**, with no
script changes: the window becomes the card nearest the middle of the screen (or the hovered/tapped
one), every card becomes a magnetic stop, and the camera steps evenly from the horizon view on the
first card to About's opening view on the last.

Keep each row's structure:

```html
<article class="index__row" tabindex="0">
  <a class="index__link" href="work/slug.html" aria-label="Project title"></a>   <!-- optional: makes the row a link -->
  <p class="index__num">N.07</p>
  <h3 class="index__title">Project title<span class="tag-soon">In production</span></h3>  <!-- tag optional -->
  <div class="index__disc"><span>Information Design</span><span>Motion Design</span></div>
</article>
```

- Update the count in the section head ("06 projects").
- Discipline words must come from `disciplines_canonical` in `data/site.json` (the live site's rule).
- `data-pan` on old rows is unused; it's safe to drop.
- Rows are full width with a fixed rhythm (title with status under it, disciplines on the right); long
  titles wrap and the row grows, which is fine.

## Experience timeline

Year positions are fractions of the axis on `<div class="tl" data-from="2017.5" data-to="2027">`:

```
frac(year) = (year - from) / (to - from)
```

Per role: `data-row = frac(start)`; its `.tl__bar` gets `data-l = frac(start)`, `data-w = frac(end) - frac(start)`,
and the same numbers as `left`/`width` % in its `style`. The ongoing role's bar gets `.is-current`. The axis
ticks (`.tl__tick`) are placed by hand at `frac(year)`. To extend the range, change `data-from`/`data-to` and
recompute. The big year label follows automatically, and it sizes itself to the room under the list.
`data/site.json` → `experience[].start/end` and `axis` already hold these numbers; generate from them.

Below 1000px wide the timeline switches to a compact form (title · dates on one line, bar beneath,
company hidden) so all roles fit the window.

## About

The camera and light are keyed to About's progress (`ABOUT_KEYS` + `aboutLight` in `src/main.js`):

- 0–0.5: one still frame looking down over the field (first passage)
- 0.53+: golden light, low in the grass (second passage), in both day and night mode
- 0.84–1: a glide into Experience's exact first frame, so the hand-over is seamless

Rewording the text is safe; keep each passage inside its range.

## Performance

- Quality presets are picked automatically (`?q=low|mid|high` to force one).
- Resolution adapts: it drops under 48 fps and rises again after sustained 58+.
- Only the window's rectangle is rendered.
- `prefers-reduced-motion` is respected.
- The pointer "breeze" is one ray per frame and costs nothing when the pointer is still.
- **Open item:** there is no fallback yet for browsers without WebGL. A poster image behind the canvas
  would be a cheap safety net.

## Testing and debugging

- `?still&y=1200` renders two frames at that scroll position and stops (screenshots).
- `?theme=dark`, `?night=0..1`, `?t=12` (scene clock).
- Press **H** for the dev panel (shot name, fps, pause). The `.hud` element can be removed in production.

## When it becomes the real homepage

- Change `<title>`, drop `<meta name="robots" content="noindex">`, and fix asset paths:
  `../../assets/css/site.css` becomes `assets/css/site.css` at the root; put `meadow.js` somewhere under
  `assets/` and update its `<script>`.
- The live homepage is generated by `build.py` (`build_index`) from `data/projects.json` (`live` + `feature`
  flags) and `data/site.json`. Generate this markup from the same data instead of hard-coding it
  (work rows from featured projects; timeline from `experience` + `axis`; headline, lede, email and
  disciplines from `site.json`).
- The headline here is "I make complicated things clear." Check that `data/site.json` → `headline` matches.
- This page doesn't load the site's `site.js`. It handles the theme toggle, nav/header hide-on-scroll, anchor
  scrolling and the nav clock itself. If `site.js` is added, make sure it doesn't also bind those
  (double toggles, fighting smooth scroll).
- Case-study pages keep using the normal site layout; only the homepage uses this.
