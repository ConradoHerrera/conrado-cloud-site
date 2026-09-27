window.__ready = true;  /* tells the head script the reveal CSS is safe to keep */
/* conrado.cloud — no dependencies. ~5KB. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- 1. Split text into word spans ---------- */
  $$('[data-split]').forEach(function (el) {
    var html = el.innerHTML.split(/(<br\s*\/?>)/i).map(function (chunk) {
      if (/^<br/i.test(chunk)) return chunk;
      return chunk.split(/\s+/).filter(Boolean).map(function (w) {
        return '<span class="w"><span>' + w + '</span></span>';
      }).join(' ');
    }).join('');
    el.innerHTML = html;
    $$('.w > span', el).forEach(function (s, i) { s.style.setProperty('--d', (i * 55) + 'ms'); });
  });

  /* ---------- 2. Scroll reveals ---------- */
  function activate(el) {
    el.classList.add('is-in');
    var kids = $$('[data-anim]', el);
    kids.forEach(function (k, i) { k.style.setProperty('--d', (i * 70) + 'ms'); k.classList.add('is-in'); });
  }
  if (!('IntersectionObserver' in window) || reduce) {
    $$('[data-anim],[data-split]').forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        activate(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    $$('[data-anim]').forEach(function (el) { if (!el.parentElement.closest('[data-anim]')) io.observe(el); });
    $$('[data-split]').forEach(function (el) { io.observe(el); });
    // Hero fires immediately on load
    requestAnimationFrame(function () {
      $$('.hero [data-split], .hero [data-anim]').forEach(function (el) { activate(el); io.unobserve(el); });
    });
  }

  /* ---------- 3. Nav auto-hide ---------- */
  var nav = $('.nav'), last = 0;
  if (nav) {
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      nav.classList.toggle('is-hidden', y > 200 && y > last);
      last = y;
    }, { passive: true });
  }

  /* ---------- 4. New York clock ---------- */
  var clock = $('[data-clock]');
  if (clock) {
    var tick = function () {
      try {
        clock.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date()) + ' NY';
      } catch (e) { clock.textContent = 'New York'; }
    };
    tick(); setInterval(tick, 15000);
  }

  /* ---------- 5. Cursor-following work preview ---------- */
  var peek = $('.peek'), rows = $$('.index__row');
  if (peek && rows.length && window.matchMedia('(hover:hover)').matches && !reduce) {
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = null, on = false;
    var items = $$('.peek__item', peek);
    function loop() {
      cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14;
      peek.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0) translate(-50%,-50%)' + (on ? ' scale(1)' : ' scale(.94)');
      raf = requestAnimationFrame(loop);
    }
    document.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!raf) { cx = tx; cy = ty; loop(); }
    }, { passive: true });
    rows.forEach(function (row) {
      row.addEventListener('mouseenter', function () {
        on = true; peek.classList.add('is-on');
        var k = row.getAttribute('data-peek');
        items.forEach(function (it) { it.classList.toggle('is-on', it.getAttribute('data-peek') === k); });
      });
      row.addEventListener('mouseleave', function () { on = false; peek.classList.remove('is-on'); });
    });
  }

  /* ---------- 5b. YouTube facades: load the player only on click ---------- */
  $$('.yt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-yt');
      if (!id) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
      f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
      f.allowFullscreen = true;
      f.title = btn.getAttribute('aria-label') || 'Video';
      btn.innerHTML = '';
      btn.appendChild(f);
      btn.style.cursor = 'default';
    }, { once: true });
  });

  /* ---------- 6. Marquee: duplicate track for seamless loop ---------- */
  $$('.marquee').forEach(function (m) {
    var t = $('.marquee__track', m);
    if (t) { var c = t.cloneNode(true); c.setAttribute('aria-hidden', 'true'); m.appendChild(c); }
  });

  /* ---------- 7. Theme ---------- */
  var themeBtn = $('[data-theme-toggle]');
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    store('cc-theme', t);
    if (themeBtn) themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light' : 'Switch to dark');
  }
  setTheme(store('cc-theme') || 'light');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

})();

/* 5c — build clips: play once when scrolled into view, then hold the last frame.
   The poster is the finished slide, so with no JS the page still shows a complete image.
   Never fire-and-forget: a play() can be rejected before the clip has data, so we wait
   for data when there is none and let a failed attempt be retried on the next pass. */
(function () {
  var clips = document.querySelectorAll('video[data-playonce]');
  if (!clips.length) return;

  function start(v) {
    if (v.getAttribute('data-played') === '1') return;
    v.setAttribute('data-played', '1');
    var go = function () {
      try { v.currentTime = 0; } catch (err) {}
      var p = v.play();
      if (p && p.catch) p.catch(function () { v.removeAttribute('data-played'); });
    };
    if (v.readyState >= 2) { go(); return; }
    v.addEventListener('loadeddata', go, { once: true });
    v.addEventListener('error', function () { v.removeAttribute('data-played'); }, { once: true });
    try { v.load(); } catch (err) {}
  }

  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(clips, start);
    return;
  }
  /* Stays observing on purpose: if one attempt fails, the next scroll past retries it. */
  var vo = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) start(e.target); });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(clips, function (v) { vo.observe(v); });
})();

/* 5d — replay button on build clips */
document.addEventListener('click', function (e) {
  var btn = e.target.closest ? e.target.closest('.clip__btn--replay') : null;
  if (!btn) return;
  var wrap = btn.closest('.cs__clip');
  var v = wrap ? wrap.querySelector('video') : null;
  if (!v) return;
  v.setAttribute('data-played', '1');
  try { v.currentTime = 0; var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (err) {}
});
