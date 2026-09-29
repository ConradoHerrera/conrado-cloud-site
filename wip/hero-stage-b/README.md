# hero-stage-b (branch of hero-stage, 2026-09-28)

## 2026-09-28 · handoff
- Signed off as the homepage format. HANDOFF.md written (read it first); section comments added in index.html.
- The timeline's year range now comes from `.tl[data-from][data-to]` (no hard-coded 2018–2026 in the script).
- Final QC: desktop 1000/1440/1920 + iPhone 390, day and night; Selected Work tested with 8 rows (adapts, no code change).

## 2026-09-28 · edits 19
- Experience year: bottom-right corner of the window, right edge on the "2018 — Present" line, sized to the room under the list (--year-size, 40–136px, measured on resize) so it never sits on the entries.
- The compact timeline (title · dates, bar beneath) now applies up to 1000px wide, covering tablets/narrow windows where the old layout overflowed.

## 2026-09-28 · edits 18 (revert)
- Reverted edits 16–17: no contact fireflies, no ember palette. src/main.js is back to edits 14 (v202609281630).
- Night "care" now uses the day's golden hour (WARM_NIGHT = WARM_DAY, setting sun), so it looks the same in both themes.

## 2026-09-28 · edits 17
- Contact fireflies drawn in their own pass after the depth of field; each makes its own round bokeh from its distance to the focus (size up, brightness down), so no more squared-off blur.
- Night "care" sky moved along the gradient: violet above, gold at the horizon, less red.

## 2026-09-28 · edits 16
- Night "care": an ember sunset (EMBER palette blended over DUSK, sun just at the horizon, glow toned down): red and gold under deep violet, grass in silhouette. Palette only, no extra cost.
- Night contact: a small swarm of fireflies along the walk (110, soft sprites, glow through the blades so the shallow focus turns them into bokeh); only while Contact is on screen at night.

## 2026-09-28 · edits 15 (mobile QC)
- Hero: first screen is just the headline window (min-height 138vh); in the intro row, Disciplines and Contact take the full width.
- Experience: one compact line per role (title · dates) with its bar beneath, company hidden; all six fit the window; head lower, year smaller.
- Education & Tools: inner inset so words never touch the window edge.

## 2026-09-28 · edits 14
- One way of moving for every window change (morph): the leading edge leaves first and the trailing edge follows (a liquid stretch), and mid-way it draws in slightly and its corners soften (radius 14→34→14). Used for section switches, the hero → intro-row move and the glide between project cards.
- Hero → intro row: the window follows the scroll with a little weight (time-smoothed) and over a longer stretch (hero min-height 122vh).

## 2026-09-28 · edits 13
- No more scroll-driven gust on "motion": the wind is constant (time only), so scrolling through About's first passage leaves the grass alone; the pointer breeze still works.

## 2026-09-28 · edits 12
- Intro-row window is taller: the words sit in the sky and the horizon drops below them (horizonAt blend by heroK); no shade, just a crisp letter shadow. Hero gets 24vh after it.
- Work camera: each project is one step of the climb from the horizon view to About's view down over the field (pos/aim/lens/focus by selected index), so the last card hands over to About almost unchanged.

## 2026-09-28 · edits 11
- Hero: scrolling on, the window closes from the headline band around the intro row (name / disciplines / contact), which is a magnetic stop of its own; a little more room after it before Work takes over.

## 2026-09-28 · edits 10
- Work: the window is the selected project's card (nearest the middle of the screen, or the one under the pointer/finger); it glides between cards, each card is a magnetic stop, and each project looks at its own slice of the meadow (data-pan). Rows go full width; a light shade sits behind the card's text inside the window. Mobile rows: number | title, pill, disciplines stacked.
- Work section tail shortened (padding-bottom 40vh instead of min-height 170vh).

## 2026-09-28 · edits 9
- Hero intro row readable over the scene (esp. mobile): soft radial shade behind it + crisp letter shadow, labels at 92% white; window copy only.

## 2026-09-28 · edits 8
- Touch is now a breeze: a wide (≈1–4.5 m, by distance), soft push along the pointer's movement, with a small ripple; it dies down when the pointer stops. Shaders skip it entirely when there's no breeze (uTouchR = 0).
- The small-text shadow is a light 3px one (the 18px blur was costly to repaint every scroll frame).

## 2026-09-28 · edits 7
- Touch: the pointer parts the grass and nudges daisies (one ray to the ground per frame in JS + a few shader ops per blade; radius scales with distance; fades out 1.6s after the pointer stops or leaves the window).
- Readability: stronger shade behind the bottom-left text in About + a soft shadow on the small paragraph (light layer only).

## 2026-09-28 · edits 6
- Canvas sized like the text layers (100%, not 100vw): with a visible scrollbar the window and its shade no longer disagree at the right edge.
- About first passage (0–0.5): one still frame looking down over the field (only the meadow and the "motion" gust move).
- Timeline colours back to the page's own day/night: About's golden light fades back during the glide into the timeline.

## 2026-09-28 · edits 5
- Education & Tools no longer has an empty tail (min-height 130vh → padding-bottom 38vh): Contact's shot takes over as the last lines leave.

## 2026-09-28 · edits 4
- About's last stretch (u 0.84→1) glides into the timeline's exact frame (pos, aim, lens, focus), so the switch to Experience has nothing left to move.

## 2026-09-28 · edits 3
- Contact: the story starts when its shot takes over (data-lead=0.5 screens), so the camera is already sinking while the section scrolls in; 150vh; label/email/LinkedIn at 0.30/0.34/0.42.
- Scrims can wait for their words (data-scrim-in): the contact shade arrives with the email.

## 2026-09-28 · edits 2
- About "motion": one steady move to the right (information shot now cranes up on the left), eased, no back-and-forth.
- Care is the scene for the whole second passage (0.58→1): low, golden, easing forward; on "understand" focus pulls to the trees; ends rising into the timeline sky.
- Experience's day now starts from About's golden hour (by night, the pre-dawn light) and carries on; light weights blend so the hand-off never flashes back to daylight.
- Contact: 165vh, email at 0.1, descent over the first 30%, then the walk continues.

## 2026-09-28 · edits
- Hero intro row inset from the window edge (margin-inline like the headline).
- Work: window narrowed to the right 34%; rows on one rhythm (number | title with status pill beneath | disciplines), all the same height.
- About opens on "I'm Conrado." (first beat at 0), no empty window on arrival.

- **Contact** now holds the low grass walk (was About): pinned 230vh; the camera sinks to blade height and walks, near blades in focus, sky through the gaps. Contact label, email and LinkedIn arrive in sequence; the page settles on the final frame (data-snap-end, and the nav link goes there too). Soft centre scrim for legibility.
- **About** has a new keyframed camera, one move per phrase: identity = one daisy singled out by focus; information = crane up until the flowers read as a pattern; motion = the gust, tracked sideways; all three = flower close, field behind; care = golden light (dusk glow at night), low and backlit; understand = haze lifts (shared FOG/FOGK uniforms), rise into a wide, fully sharp view.
- Text beats and timings unchanged.

# WIP — "Stage"

One window onto the garden, pinned to the screen. It never scrolls: it morphs between one
rectangle per section (same corner radius every time), scrubbed by the scroll, so scrolling back
plays it in reverse. The page scrolls over it, and text is ink on paper but turns white where it
passes over the window, split exactly at the window's edge.

  Hero        wide band under the nav   the meadow; the whole headline opens inside it
  Work        tall, right half          a long lens across the meadow, flowers soft in the
                                        foreground; hovering a project pans to its own view
  About       full, pinned              the camera moves through the grass while the words arrive
                                        one phrase at a time, coming into focus. "motion" brings a
                                        gust of wind; on "understand" the camera rises out of the
                                        grass and the focus pulls clear across the meadow
  Experience  full, pinned              the timeline sits in the sky; a playhead runs 2018 → 2026
                                        while the camera tracks the horizon, each bar drawing itself
                                        as the years reach it, with a big year counter
  Education   tall, right half          the long lens, looking the other way
  Contact     almost full screen        the sky, with the email on it

Magnetic scroll: stop within half a screen of a section's best position and the page glides
there (scrolling down pulls forward, up pulls back). It never pulls in the middle of a section,
and it's off for reduced motion.

Tune it
  - Window shapes: windowFor() in src/main.js (x, y, w, h per section; R = the one corner radius).
  - Camera shots: SHOTS in src/main.js. Depth of field: src/dof.js.
  - Text beats: any element with data-in="0.3" (and optionally data-out) appears at that point
    of its section's progress. Pinned sections are marked data-pinned and hold a [data-pin] stage.
  - Snap positions: each section's [data-snap] element lands just under the nav.
  - When the morph happens: in direct(), a change starts 75% of a screen before the next section
    and finishes at 10%.
  - Text colours over the window: the .layer--light block in index.html (it re-maps the site's
    colour tokens to white).

How the colour split works: the content exists twice. The ink copy is clipped to outside the
window, and a white copy (made automatically at load, hidden from screen readers) is clipped to
inside it. A smooth scroll moves both copies and the window in the same frame, so they never
drift.

Open:  in `site/` run `python3 -m http.server`, then http://localhost:8000/wip/hero-stage/
Rebuild: npm i three@0.169.0 esbuild && npx esbuild src/main.js --bundle --minify --format=iife --outfile=meadow.js
Siblings: ../hero-morph/ · ../hero-window/ · ../hero-glass/ · ../hero-clear/ · ../hero-meadow/. Nothing here deploys.

Performance (2026-09-27 pass)
  - Fixed: after the page lowered its resolution under load, the 3D pipeline kept its old size,
    so only part of the window redrew and the rest showed fragments of old shots.
  - The camera renders only the window's rectangle, with a frustum that fits it, and the blur is
    clamped to the window so nothing outside can bleed in.
  - The meadow is split into 5 m tiles: tiles outside the shot aren't drawn; distant tiles use
    half-detail blades and are thinned out. Daisies use simpler petals.
    Triangles per frame: hero 3.45M → 1.86M, work 2.99M → 1.44M.
  - Resolution adapts both ways: steps down under ~48 fps, back up after sustained 58+.
  - Text layers are only re-cut when the window actually changes shape; styles are only written
    when their values change; hidden text stops painting.
  - Recovers from a lost GPU context (e.g. after the laptop sleeps) by reloading.

Quality pass 2 (2026-09-27)
  - Header: the live site's header, exactly (site.css .veil progressive blur + paper tint, and
    the nav with its colour-inverting blend). The nav hides on the way down and comes back on
    the way up. Content now blurs and fades into the header like on the live site.
  - Pinned stages (About, Experience) fade in as they arrive and out as they leave, so they
    never overlap each other.
  - The shade behind the About text is one soft gradient over the whole window, fading with
    the section (it was a hard-edged box).
  - Year counter starts at 2018; hero and contact text keep a margin from the window's edge.

Night mode (2026-09-27)
  - The site's own theme toggle (bottom right; same button, same `cc-theme` storage key and
    `data-theme="dark"` attribute as the live site, so the choice carries across pages).
  - Switching to night plays a sunset over ~3.4 s: the sun sinks to the horizon through a gold
    and pink dusk, the sky deepens, stars come out (twinkling, hidden behind clouds), the moon
    rises where the sun set, the meadow goes silver-blue, and fireflies rise out of the grass.
    Switching back plays it in reverse. Paper and ink follow a beat behind the sky.
  - Palettes: DAY / DUSK / NIGHT near the top of src/main.js. Firefly count in makeFireflies().
  - Dev: ?night=0.5 freezes the time of day (0 day, 0.5 dusk, 1 night); ?theme=dark forces the page.

Refinements (2026-09-27, late)
  - Education & Tools: one hairline, one label per block, no rules between items.
  - Experience: the camera holds still; instead the years pass as seasons in the meadow
    (Jan frost → Apr green with daisies → Jul gold-green → Oct amber → frost), one year per year
    of the timeline, like a time-lapse. It's only colour, so it costs almost nothing.
    Season palettes: SEASONS in src/main.js.
  - Work: hovering a project no longer pans. It racks focus from the distant meadow to the
    flowers in front, then back when you leave the list.
  - Slower machines: after resolution reaches 1x, the meadow thins itself (down to 35% of the
    grass) to keep scrolling smooth, and fills back in when there's headroom.

Contact & footer (2026-09-27)
  - The page ends on the contact screen: the address is centred in the window, and the footer
    sits in a band beneath it. Every window leaves the same band at the bottom, and the day/night
    button always sits in it, its right edge on the window's edge.
  - The script is loaded as meadow.js?v=<build time>, so a browser can never show an old copy.
  - The dev panel is hidden by default now: press H to show it.

A whole day across the timeline (2026-09-27, replaces the seasons)
  - Scrolling Experience plays one full day, starting and ending on the page's own theme:
    day → sunset → night → sunrise → day (or the reverse in night mode). Midnight falls ~2022.
  - Sunset: the sun sinks into the tree line left of centre; orange horizon, rose then magenta and
    violet above; clouds fired orange from underneath. Sunrise: comes up on the right; peach
    horizon, pink and lavender above, rose-gold clouds. Stars and fireflies in between.
  - The sky now has a three-stop gradient (horizon / coloured middle band / zenith), a glow along
    the horizon on the sun's side, and clouds with their own lit and shaded colours.
  - Palettes: DAY, DUSK (sunset), DAWN (sunrise), NIGHT in src/main.js.

Sun path & toggle speed (2026-09-27)
  - The sun and moon now have separate paths. The sun descends in one steady arc and goes below
    the horizon (sunrise is the same path in reverse, on the other side); the moon rises on its
    own. Before, the moon borrowed the sun's direction, so the sun appeared to come back up.
  - The day/night toggle is now a quick switch (~0.65 s), with the page colours changing at the
    same time. The slow transition still lives in the timeline.

One journey (2026-09-27)
  - The camera no longer drifts per section. Everything happens from one spot in the meadow
    (SPOT in src/main.js): stand and look out (hero) → zoom toward the horizon (work) → step down
    into the grass, walk through it, rise out (about) → tilt up to the sky (experience) → zoom
    toward the far meadow (education) → look up into the clouds (contact).
  - Only About moves with the scroll; elsewhere the camera just breathes very slowly.
  - Between sections the camera turns along the shortest arc (quaternion slerp) instead of
    dragging a look-at point across the scene, so every transition is one clean move.

Switching, framing, header (2026-09-27)
  - Section changes are a switch, not a scrub: each state holds until the next section reaches
    the middle of the screen, then the window and camera animate to it in ~0.5 s (and back the
    same way). No more half-morphed in-between states. Tune in direct(): `H * 0.5` (when) and
    `dt * 6.5` (how fast).
  - Experience and Contact aim so the horizon sits at a fixed height of the frame (74% / 80%)
    whatever the window's shape, so the grass never drops out on wide screens (horizonAt()).
  - The header blur hides and returns with the nav.
