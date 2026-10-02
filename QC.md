# QC — conrado.cloud

Nothing is "done" until this has been run and passes. The general principles
live in the `build-qc` skill (they apply to every project); this file is the
part that is specific to this site.

## Run it

```
python3 build.py
node qc/qc.js                       # public build, desktop + phone, ~5 min in a sandbox
node qc/qc.js --only=menu,links     # one or more checks: links layout menu hover keys cases
node qc/qc.js --dir=dist-preview    # the preview build instead
```

Needs Node, Playwright and a Chromium. It serves the build over http itself
(fonts don't load from `file://`, and a page laid out in the fallback font is
not the page anyone sees).

## What it checks, and the review that taught us each one

| Check | Why it exists |
| --- | --- |
| Every visible link and button is the thing under its own centre, at every half-screen of the homepage, desktop and phone | 30 Sep: `.layer--light{pointer-events:none}` made every link inside the window dead — the contact email, LinkedIn, the work rows — and made the rows flicker on hover. Caught by Casper, Oct 1. |
| No fixed control (day/night button, section rail) covers words | Casper: the day/night button sat on "CONRADO.CLOUD" in the case-study footer. |
| Slash lists never break inside an item | Casper: "Litigation / Graphics" split across lines, slashes opening lines. |
| Menu jumps cut; the page never visibly scrolls through other sections | Conrado: "make that section just fade in instead of showing us the full scroll". |
| Menu → Work lands on project 1 with every project in view | Casper: Work landed on #3 (LOCH). |
| Menu → About lands with the whole first passage readable | Conrado, Sep 30. |
| Contact address is a working `mailto:` | Casper. |
| Hovering a project holds the window on it, no flicker | Casper (phone) — same root cause as the dead links. |
| A tap on a project opens it (phone) | Casper: "I cannot click them either". |
| Tab walks the page; every stop shows the ring and is brought on screen; the text layer never scrolls out of register | Casper: tab highlight "looks ugly"; the page scrolls by script, so a browser's own focus-scroll would break it. |
| Case studies: footer clear of the button, no empty links, every relative link resolves, no script errors | Standing. |
| No script or shader errors anywhere | Oct 2: a GLSL reserved word (`patch`) broke a shader only the QC run noticed. |

## What the script can't see — look at these yourself

Take stills (`?still&y=<px>` renders a deterministic frame) at: hero, intro row,
each work card, About at 0.44, Experience at 0 and 0.55, Education, Contact
end — desktop 1440×900 and phone 390×844 — and look at every one. Then:

- Scroll **backwards** through each pinned section as well as forwards.
- Nothing ever looks broken mid-scroll: everything is present; only the data animates (bars, playhead).
- No hairline crosses the window or a highlighted card. No divider without a job.
- Words and the window move together: a fade starts on the same scroll position as the morph that goes with it.
- Fades in place for pinned content; enter and exit from the same side (left).
- One corner radius (14px) for the window and every media frame.
- Text sits on sky or paper, never on busy grass, unless it has its scrim.
- Phone: the address bar sliding must not move the layout (`vh()` in main.js).
- The menu's veil ends above the window's top edge (68px), so that edge is never blurred.

## Things only a real device shows

Say so in the report instead of claiming them: real-phone URL-bar behaviour,
real GPU frame rate, touch feel. Ask Conrado to check them.
