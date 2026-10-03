/* ============================================================
   conrado.cloud — QC. Run after every change, before saying it's done.

     node qc/qc.js                 # everything, desktop + phone
     node qc/qc.js --only=links    # one check (links|layout|menu|hover|steps|viewport|icons|keys|cases)
     node qc/qc.js --dir=dist-preview  # which build to test (default dist, the public one)

   Needs Playwright with a Chromium. In a sandbox without a GPU, Chromium
   draws WebGL in software (SwiftShader), very slowly: the live checks wait
   for the page's own state (window.__qc) rather than for fixed times.

   Every check here exists because a real review caught the bug it looks
   for. When a review catches a new kind of bug, add the check that would
   have caught it, then fix the bug. (See QC.md for the list and history.)
   ============================================================ */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DIR = path.resolve(__dirname, '..', args.dir || 'dist');
// served over http, not file://: fonts are blocked from file:// pages, and a page
// laid out in the fallback font is not the page anyone will see
const PORT = 8000 + Math.floor(Math.random() * 900);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HOME = ORIGIN + '/index.html';
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const run = (name) => !ONLY || ONLY.has(name);
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  laptop: { viewport: { width: 1180, height: 760 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

let fails = 0, passes = 0;
const log = (ok, label, detail = '') => {
  ok ? passes++ : fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

async function open(browser, view, url) {
  const ctx = await browser.newContext(VIEWS[view]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  return { ctx, page };
}
// a still frame of the homepage at a scroll position: deterministic and fast
async function still(browser, view, y, extra = '') {
  const { ctx, page } = await open(browser, view, `${HOME}?still&q=low&y=${y}${extra}`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
  return { ctx, page };
}
const qc = (page) => page.evaluate(() => window.__qc && window.__qc());
async function until(page, fn, arg, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); }
  return false;
}

/* ---------- in the page: every link and button you can see is the thing you'd click ---------- */
function sweepLinks() {
  const out = [];
  const H = innerHeight, W = innerWidth;
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n !== document; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
  const key = (el) => el.tagName === 'A' ? 'a:' + el.getAttribute('href') : 'b:' + (el.getAttribute('aria-label') || el.textContent.trim());
  for (const el of document.querySelectorAll('a[href],button')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > W || cy > H) continue;
    if (opacityOf(el) < 0.3) continue;
    const hit = document.elementFromPoint(cx, cy);
    // content passing under the menu bar is meant to be covered by it
    if (hit && hit.closest('.nav') && !el.closest('.nav')) continue;
    const got = hit && hit.closest('a[href],button');
    if (!got || key(got) !== key(el)) {
      // a link that is drawn but clipped away (the ink copy inside the window, the light copy
      // outside it) is fine as long as what IS under the point is its twin
      out.push({ want: key(el), got: got ? key(got) : (hit ? hit.tagName + '.' + hit.className : 'nothing'), x: Math.round(cx), y: Math.round(cy) });
    }
  }
  // de-duplicate the twin pairs
  const seen = new Set();
  return out.filter((f) => { const k = f.want + f.x + f.y; if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------- in the page: fixed controls never sit on top of words ---------- */
function sweepOverlaps() {
  const out = [];
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n !== document; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= parseFloat(cs.opacity); } return o; };
  const controls = [...document.querySelectorAll('.tools button, .rail.is-in a')].filter((c) => opacityOf(c) > 0.3);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const words = [];
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('.tools,.rail,.sr-only,script,style,[aria-hidden="true"]:not(.layer--light)')) continue;
    if (opacityOf(el) < 0.3) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.bottom > 0 && r.top < innerHeight) words.push({ r, t: n.textContent.trim().slice(0, 30) });
  }
  // is this point of the text actually visible (not clipped away by the window)?
  for (const c of controls) {
    const cr = c.getBoundingClientRect();
    for (const w of words) {
      const r = w.r;
      if (r.right <= cr.left + 1 || r.left >= cr.right - 1 || r.bottom <= cr.top + 1 || r.top >= cr.bottom - 1) continue;
      out.push({ control: c.getAttribute('aria-label') || c.textContent.trim(), text: w.t });
    }
  }
  return out;
}

/* ---------- in the page: a slash list only ever breaks after a separator ---------- */
function sweepLists() {
  const bad = [];
  for (const li of document.querySelectorAll('.li')) {
    const rs = [...li.getClientRects()].filter((r) => r.width > 0);
    if (rs.length > 1) bad.push(li.textContent);
  }
  return bad;
}

async function checkStills(browser) {
  for (const view of ['desktop', 'phone']) {
    // walk the page in half-screen steps
    const probe = await still(browser, view, 0);
    const st = await qc(probe.page);
    const max = Math.max(...st.sections.map((s) => s.top + s.h)) - st.H;
    log(probe.page.errors.length === 0, `${view}: no script errors on load`, probe.page.errors.slice(0, 2).join(' | '));
    if (run('layout')) {
      const lists = await probe.page.evaluate(sweepLists);
      log(lists.length === 0, `${view}: slash lists never split an item`, lists.join(', '));
    }
    await probe.ctx.close();
    const ys = [];
    for (let y = 0; y <= max; y += st.H * 0.5) ys.push(Math.round(y));
    ys.push(Math.round(max));
    let linkFails = [], overlapFails = [], navFails = [];
    for (const y of ys) {
      const { ctx, page } = await still(browser, view, y);
      if (run('links')) for (const f of await page.evaluate(sweepLinks)) linkFails.push({ ...f, at: y });
      if (run('layout')) { const top = await page.evaluate(() => document.querySelector('.nav').getBoundingClientRect().top); if (top < 0) navFails.push(y); }
      if (run('layout')) for (const f of await page.evaluate(sweepOverlaps)) overlapFails.push({ ...f, at: y });
      await ctx.close();
    }
    if (run('links')) log(linkFails.length === 0, `${view}: every visible link/button is clickable at ${ys.length} scroll positions`,
      linkFails.slice(0, 6).map((f) => `scroll ${f.at}: ${f.want} → ${f.got} at ${f.x},${f.y}`).join(' | '));
    if (run('layout')) log(navFails.length === 0, `${view}: the menu stays on screen all the way down`, navFails.join(', '));
    if (run('layout')) log(overlapFails.length === 0, `${view}: no fixed control covers text`,
      overlapFails.slice(0, 6).map((f) => `scroll ${f.at}: ${f.control} over "${f.text}"`).join(' | '));
  }
}

async function settle(page) {
  // the jump is done and the scroll is still
  await until(page, () => { const s = window.__qc(); return !s.jump && !s.jumping && Math.abs(s.cur - s.scrollY) < 1; });
  await page.waitForTimeout(400);
}

async function checkMenu(browser) {
  for (const view of ['desktop', 'phone']) {
    const { ctx, page } = await open(browser, view, HOME + '?q=low');
    await until(page, () => !!window.__qc);
    await page.waitForTimeout(1500);
    for (const [name, href] of [['Work', '#work'], ['About', '#about'], ['Contact', '#contact'], ['Work again', '#work'], ['brand (top)', '#top']]) {
      const before = (await qc(page)).scrollY;
      // record every scroll position the page passes through on the way
      await page.evaluate(() => { window.__ys = []; window.__ysT = setInterval(() => window.__ys.push(scrollY), 16); });
      const sel = href === '#top' ? '.nav__brand' : `.nav__links a[href="${href}"]`;
      await page.locator(sel).first().click();
      await settle(page);
      const ys = await page.evaluate(() => { clearInterval(window.__ysT); return [...new Set(window.__ys)]; });
      const s = await qc(page);
      const between = ys.filter((y) => Math.abs(y - before) > 2 && Math.abs(y - s.scrollY) > 2);
      log(between.length === 0, `${view}: menu ${name} cuts, never scrolls through the page`, between.length ? `passed ${between.length} positions` : '');
      if (href === '#work') {
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-layer=ink] .s-work .index__row')].map((r) => { const b = r.getBoundingClientRect(); return [b.top, b.bottom]; }));
        const band = VIEWS[view].viewport.width < 820 ? 64 : 76;
        const allIn = rows.every(([t, b]) => t >= 60 && b <= s.H - band + 2);
        log(Math.round(s.sel) === 0, `${view}: menu ${name} lands on project 1`, `sel=${s.sel}`);
        log(allIn, `${view}: menu ${name} shows every project`, JSON.stringify(rows.map((r) => r.map(Math.round))));
      }
      if (href === '#about') {
        // the first passage arrives as a step: give its pieces their few seconds
        await until(page, () => [...document.querySelectorAll('[data-layer=ink] .s-about [data-step-group]')][0].querySelectorAll('[data-step]').length ===
          [...[...document.querySelectorAll('[data-layer=ink] .s-about [data-step-group]')][0].querySelectorAll('[data-step]')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && parseFloat(getComputedStyle(e).opacity) > 0.95).length, null, 15000);
        const vis = await page.evaluate(() => [...[...document.querySelectorAll('[data-layer=ink] .s-about [data-step-group]')][0].querySelectorAll('[data-step]')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && parseFloat(getComputedStyle(e).opacity) > 0.9).length);
        log(vis >= 6, `${view}: menu About lands with the whole first passage readable`, `${vis} pieces visible`);
      }
      if (href === '#contact') {
        const hit = await page.evaluate(() => { const a = document.querySelector('[data-layer=light] .contact__mail'); const b = a.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return h && h.closest('a') ? h.closest('a').getAttribute('href') : null; });
        log(hit && hit.startsWith('mailto:'), `${view}: contact address is a working mailto`, String(hit));
      }
      if (href === '#top') log(s.scrollY === 0, `${view}: brand goes to the top`, `y=${s.scrollY}`);
    }
    log(page.errors.length === 0, `${view}: no script errors through the menu`, page.errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

async function checkHover(browser) {
  const { ctx, page } = await open(browser, 'desktop', HOME + '?q=low#work');
  await until(page, () => !!window.__qc);
  await settle(page);
  for (const i of [0, 1, 2]) {
    const b = await page.evaluate((i) => { const r = document.querySelectorAll('[data-layer=ink] .s-work .index__row')[i]; if (!r) return null; const x = r.getBoundingClientRect(); return { x: x.left + x.width * 0.3, y: x.top + x.height / 2 }; }, i);
    if (!b) continue;
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await until(page, (i) => Math.abs(window.__qc().sel - i) < 0.01, i, 30000);
    const samples = [];
    for (let k = 0; k < 10; k++) { samples.push((await qc(page)).sel); await page.waitForTimeout(150); }
    const steady = samples.every((v) => Math.abs(v - i) < 0.01);
    log(steady, `desktop: hovering project ${i + 1} holds the window on it (no flicker)`, samples.map((v) => v.toFixed(2)).join(','));
  }
  await ctx.close();
  // a phone: a tap on a live project opens it
  const ph = await open(browser, 'phone', HOME + '?q=low#work');
  await until(ph.page, () => !!window.__qc);
  await settle(ph.page);
  const t = await ph.page.evaluate(() => { const r = document.querySelector('[data-layer=ink] .s-work .index__row .index__link'); const x = r.closest('.index__row').getBoundingClientRect(); return { x: x.left + x.width / 2, y: x.top + x.height / 2, href: r.getAttribute('href') }; });
  await Promise.all([ph.page.waitForURL('**/work/**', { timeout: 30000 }).catch(() => {}), ph.page.touchscreen.tap(t.x, t.y)]);
  log(ph.page.url().includes('/work/'), 'phone: tapping project 1 opens its case study', ph.page.url().split('/').slice(-2).join('/'));
  await ph.ctx.close();
}

/* ---------- a passage arrives on one scroll step, piece after piece, in place ---------- */
async function checkSteps(browser) {
  // held in place on the way in: the timeline and About's words are in the same spot as their
  // shot takes the window as they are once the section is pinned (they don't scroll up into place)
  for (const view of ['desktop', 'phone']) {
    const probe = await still(browser, view, 0);
    const st = await qc(probe.page); await probe.ctx.close();
    for (const [id, sel] of [['track', '.s-exp .tl__row'], ['about', '.s-about .beats__big']]) {
      const sec = st.sections.find((q) => q.id === id);
      const tops = [];
      for (const y of [Math.round(sec.top - 0.4 * st.H), Math.round(sec.top)]) {
        const { ctx, page } = await still(browser, view, y);
        tops.push(await page.evaluate((sel) => document.querySelector('[data-layer=ink] ' + sel).getBoundingClientRect().top, sel));
        await ctx.close();
      }
      log(Math.abs(tops[0] - tops[1]) < 1, `${view}: ${id === 'track' ? 'the timeline' : "About's words"}: in place as the shot arrives`, tops.map(Math.round).join(' → '));
    }
  }
  for (const view of ['desktop', 'phone']) {
    const { ctx, page } = await open(browser, view, HOME + '?q=low');
    await until(page, () => !!window.__qc);
    await page.waitForTimeout(1200);
    await page.evaluate(() => { location.hash = '#experience'; });
    await settle(page);
    const y0 = (await qc(page)).scrollY;
    // record when each row first becomes readable, without touching the scroll
    const order = await page.evaluate(() => new Promise((res) => {
      const rows = [...document.querySelectorAll('[data-layer=ink] .s-exp .tl__row')], seen = rows.map(() => 0), t0 = performance.now();
      const top0 = rows[rows.length - 1].getBoundingClientRect().top;
      const tick = () => {
        rows.forEach((r, i) => { if (!seen[i] && getComputedStyle(r).visibility !== 'hidden' && parseFloat(getComputedStyle(r).opacity) > 0.5) seen[i] = performance.now() - t0 + 1; });
        if (seen.every(Boolean) || performance.now() - t0 > 20000) res({ seen, moved: Math.abs(rows[rows.length - 1].getBoundingClientRect().top - top0) }); else setTimeout(tick, 30);
      };
      tick();
    }));
    const y1 = (await qc(page)).scrollY;
    const moved = order.moved, seen = order.seen;
    const all = seen.every(Boolean), inOrder = seen.every((t, i) => i === 0 || t >= seen[i - 1] - 1) && seen[seen.length - 1] - seen[0] > 100;
    log(all && y1 === y0, `${view}: the timeline fills in without scrolling further`, all ? '' : `${seen.filter(Boolean).length}/${seen.length} rows`);
    log(inOrder, `${view}: its rows arrive one after another, top to bottom`, seen.map((t) => Math.round(t)).join(','));
    log(moved < 1, `${view}: and in place (nothing slides while they arrive)`, `moved ${moved.toFixed(1)}px`);
    await ctx.close();
  }
}

/* ---------- a phone's address bar: what sits on the window's bottom edge moves with it ---------- */
async function checkViewport(browser) {
  const ctx = await browser.newContext(VIEWS.phone);
  const page = await ctx.newPage();
  for (const [hash, label] of [['#experience', 'the year'], ['#about', 'About\'s words']]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME + '?q=low' + hash, { waitUntil: 'load' });
    await until(page, () => !!window.__qc);
    await settle(page);
    await page.waitForTimeout(2500);
    for (const h of [744, 844, 700]) {
      await page.setViewportSize({ width: 390, height: h });
      await until(page, (h) => Math.abs(window.__qc().win.y + window.__qc().win.h - (h - 64)) < 2, h, 20000);
      await page.waitForTimeout(600);
      const r = await page.evaluate((hash) => {
        const s = window.__qc(), wb = s.win.y + s.win.h;
        const sel = hash === '#experience' ? '[data-layer=light] .s-exp .year' : '[data-layer=light] .s-about .beats';
        const el = [...document.querySelectorAll(sel)].find((e) => getComputedStyle(e.closest('[data-pin]')).visibility !== 'hidden') || document.querySelector(sel);
        const b = el.getBoundingClientRect(), rail = document.querySelector('.rail').getBoundingClientRect(), band = document.querySelector('.tools button').getBoundingClientRect();
        return { wb: Math.round(wb), bottom: Math.round(b.bottom), railIn: rail.bottom <= wb + 1 && rail.top >= s.win.y, bandBelow: band.top >= wb - 1 };
      }, hash);
      log(r.bottom <= r.wb && r.railIn && r.bandBelow, `phone ${h}px tall: ${label}, the rail and the band stay with the window's bottom edge`,
        `window bottom ${r.wb}, element bottom ${r.bottom}, rail in ${r.railIn}, band below ${r.bandBelow}`);
    }
  }
  await ctx.close();
}

/* ---------- icons Conrado supplies are drawn as supplied: outline at rest, filled on hover/current ---------- */
async function checkIcons(browser) {
  const { ctx, page } = await open(browser, 'desktop', HOME + '?q=low#about');
  await until(page, () => !!window.__qc);
  await settle(page);
  await until(page, () => document.querySelector('.rail').classList.contains('is-in'), null, 20000);
  const look = () => page.evaluate(() => [...document.querySelectorAll('.rail a')].map((a) => {
    const shown = [...a.querySelectorAll('svg')].filter((s) => getComputedStyle(s).display !== 'none');
    const cs = shown[0] && getComputedStyle(shown[0]);
    return { for: a.dataset.railFor, current: a.getAttribute('aria-current') === 'true', shown: shown.map((s) => s.classList.contains('is-fill') ? 'fill' : 'line'),
      painted: !!cs && cs.fill !== 'none' && (cs.stroke === 'none' || parseFloat(cs.strokeWidth) === 0) };
  }));
  let st = await look();
  log(st.every((i) => i.painted && i.shown.length === 1), 'rail icons are painted as solid shapes, one version at a time (not stroked)', JSON.stringify(st));
  log(st.every((i) => i.shown[0] === (i.current ? 'fill' : 'line')), 'rail: outline at rest, filled for the current section', st.map((i) => `${i.for}:${i.shown[0]}`).join(' '));
  const idle = st.find((i) => !i.current);
  const b = await page.evaluate((f) => { const r = document.querySelector(`.rail a[data-rail-for="${f}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, idle.for);
  await page.mouse.move(b.x, b.y);
  await page.waitForTimeout(300);
  st = await look();
  log(st.find((i) => i.for === idle.for).shown[0] === 'fill', 'rail: hovering an icon fills it');
  await ctx.close();
}

async function checkKeys(browser) {
  const { ctx, page } = await open(browser, 'desktop', HOME + '?q=low');
  await until(page, () => !!window.__qc);
  await page.waitForTimeout(1200);
  const seen = [];
  for (let k = 0; k < 18; k++) {
    await page.keyboard.press('Tab');
    await settle(page);
    // anything that slides in to meet the focus gets a moment to arrive (frames are slow here)
    await until(page, () => { const el = document.activeElement; if (!el || el === document.body) return true; const b = el.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; }, null, 6000);
    const f = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
      const twin = document.querySelector('[data-layer=light] .is-focus');
      return { label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('href') || '').trim().slice(0, 28),
        ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, inView: b.bottom > 0 && b.top < innerHeight,
        clip: document.querySelector('[data-layer=ink] .clipper').scrollTop, twin: !!twin };
    });
    if (!f) continue;
    seen.push(f);
  }
  log(seen.length > 6, 'keyboard: Tab walks the page', `${seen.length} stops`);
  log(seen.every((f) => f.ring), 'keyboard: every stop shows the focus ring', seen.filter((f) => !f.ring).map((f) => f.label).join(', '));
  log(seen.every((f) => f.inView), 'keyboard: every stop is brought on screen', seen.filter((f) => !f.inView).map((f) => f.label).join(', '));
  log(seen.every((f) => f.clip === 0), 'keyboard: the text layer is never scrolled out of register');
  await ctx.close();
}

async function checkCases(browser) {
  const work = path.join(DIR, 'work');
  for (const file of fs.readdirSync(work).filter((f) => f.endsWith('.html'))) {
    const { ctx, page } = await open(browser, 'desktop', `${ORIGIN}/work/${file}`);
    await page.waitForTimeout(400);
    // the bottom of the page, where the footer meets the day/night button
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(300);
    const over = await page.evaluate(sweepOverlaps);
    log(over.length === 0, `${file}: day/night button clear of the footer`, over.map((o) => o.text).join(', '));
    const broken = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => !h || h === '#'));
    log(broken.length === 0, `${file}: no empty links`);
    log(page.errors.length === 0, `${file}: no script errors`, page.errors.slice(0, 2).join(' | '));
    // relative links point at files that exist
    const rel = await page.evaluate(() => [...document.querySelectorAll('a[href],img[src],video[src],source[src]')].map((a) => a.getAttribute('href') || a.getAttribute('src')).filter((h) => h && !/^(https?:|mailto:|#|data:)/.test(h)));
    const missing = rel.map((h) => h.split('#')[0].split('?')[0]).filter((h) => h && !fs.existsSync(path.resolve(work, h)));
    log(missing.length === 0, `${file}: every relative link resolves`, [...new Set(missing)].slice(0, 4).join(', '));
    await ctx.close();
  }
}

(async () => {
  const server = require('child_process').spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', DIR], { stdio: 'ignore' });
  process.on('exit', () => server.kill());
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ args: GL });
  console.log('QC', DIR);
  if (run('links') || run('layout')) await checkStills(browser);
  if (run('menu')) await checkMenu(browser);
  if (run('hover')) await checkHover(browser);
  if (run('steps')) await checkSteps(browser);
  if (run('viewport')) await checkViewport(browser);
  if (run('icons')) await checkIcons(browser);
  if (run('keys')) await checkKeys(browser);
  if (run('cases')) await checkCases(browser);
  await browser.close();
  server.kill();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
