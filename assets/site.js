/* =========================================================================
   menj.buzz — runtime behaviour

   The page itself is static: every section is rendered at build time from the
   JSON in data/ by build/render.mjs. This file only does the things that
   cannot be done ahead of time — the theme switch, the marquee control, the
   contents rail, and the live blog feed.
   ========================================================================= */
(function () {
  'use strict';

  if (window.__menjSiteInit) return;
  window.__menjSiteInit = true;

  var root = document.documentElement;
  var KEY = 'menj-theme';

  /* ---------- Copyright year ----------
     Baked at build time; refreshed here so a long-cached page cannot go
     stale on 1 January. */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Theme ----------
     Precedence: stored choice, then system preference, then the night
     default. The pre-paint snippet in <head> has already applied it; this
     only wires the controls. */
  var buttons = [document.getElementById('themeBtn'), document.getElementById('themeBtn2')].filter(Boolean);
  var primaryLabel = document.getElementById('themeLabel');
  var secondaryLabel = document.getElementById('themeLabel2');

  function paintTheme() {
    var isDay = root.dataset.theme === 'day';
    if (primaryLabel) primaryLabel.textContent = isDay ? 'Day' : 'Night';
    if (secondaryLabel) secondaryLabel.textContent = isDay ? 'night' : 'day';
    buttons.forEach(function (btn) {
      /* The header control is a switch, the footer one a labelled button. */
      if (btn.getAttribute('role') === 'switch') {
        btn.setAttribute('aria-checked', isDay ? 'true' : 'false');
      } else {
        btn.setAttribute('aria-pressed', isDay ? 'true' : 'false');
      }
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'day' ? 'night' : 'day';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
      paintTheme();
    });
  });
  paintTheme();

  /* ---------- Marquee ---------- */
  var marquee = document.querySelector('.marquee');
  var marqueeBtn = document.getElementById('marqueeBtn');
  if (marquee && marqueeBtn) {
    marqueeBtn.addEventListener('click', function () {
      var paused = marquee.getAttribute('data-paused') === 'true';
      marquee.setAttribute('data-paused', paused ? 'false' : 'true');
      marqueeBtn.setAttribute('aria-pressed', paused ? 'false' : 'true');
      marqueeBtn.textContent = paused ? 'Pause' : 'Play';
    });
  }

  /* ---------- Blog feed ----------
     The only content assembled in the browser, because it changes without a
     rebuild. Configuration comes from the #site-feed block, which the build
     emits from data/site.json. The WordPress REST API sends an
     Access-Control-Allow-Origin header for cross-origin GET, so no proxy is
     needed. Results are held in sessionStorage for cacheMinutes. */
  function feedConfig() {
    var node = document.getElementById('site-feed');
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch (e) { return null; }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function decode(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    return box.textContent.trim();
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function readCache(key, minutes) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var box = JSON.parse(raw);
      return Date.now() - box.at > minutes * 60000 ? null : box.posts;
    } catch (e) { return null; }
  }

  function writeCache(key, posts) {
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), posts: posts })); } catch (e) {}
  }

  function renderPosts(posts) {
    var list = document.getElementById('postList');
    if (!list) return;
    list.innerHTML = '';

    posts.forEach(function (post) {
      var li = el('li', 'reveal grid grid-cols-[4.5rem_1fr] sm:grid-cols-[6rem_1fr] gap-4 py-6 hairline');
      li.appendChild(el('span', 'font-mono text-[11px] text-muted pt-1', formatDate(post.date)));

      var body = el('div');
      var h3 = el('h3', 'font-display text-lg sm:text-xl');
      var a = el('a', 'link-u hover:text-accent transition-colors',
                 decode(post.title && post.title.rendered ? post.title.rendered : ''));
      a.href = post.link;
      a.target = '_blank';
      a.rel = 'noopener';
      h3.appendChild(a);
      body.appendChild(h3);

      var excerpt = post.excerpt && post.excerpt.rendered ? decode(post.excerpt.rendered) : '';
      if (excerpt) {
        if (excerpt.length > 180) excerpt = excerpt.slice(0, 180).replace(/\s+\S*$/, '') + '…';
        body.appendChild(el('p', 'text-sm text-muted mt-1', excerpt));
      }

      li.appendChild(body);
      list.appendChild(li);
      observeReveal(li);
    });
  }

  function loadFeed() {
    var feed = feedConfig();
    var list = document.getElementById('postList');
    var notice = document.getElementById('feedNotice');
    if (!feed || !feed.endpoint || !list) return Promise.resolve();

    var count = feed.count || 6;
    var key = 'menj-feed:' + feed.endpoint + ':' + count;
    var hit = readCache(key, feed.cacheMinutes || 30);
    if (hit) { renderPosts(hit); return Promise.resolve(); }

    var url = feed.endpoint + '?per_page=' + count +
              '&orderby=date&order=desc&_fields=id,date,link,title,excerpt';

    return fetch(url, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (posts) {
        if (!posts || !posts.length) throw new Error('empty feed');
        writeCache(key, posts);
        renderPosts(posts);
      })
      .catch(function (err) {
        if (notice) notice.hidden = false;
        if (window.console) console.warn('Blog feed unavailable:', err);
      });
  }


  /* ---------- Google Preferred Source ----------
     Our own button rather than Google's badge, so it matches the rest of the
     page, wired to the official SDK flow. The anchor's href is the deeplink,
     so the button still works with JavaScript off or if the SDK fails to
     load; the click handler intercepts only once the SDK is ready. The theme
     passed to init follows the site's own theme. */
  function initPreferredSource() {
    var triggers = document.querySelectorAll('.gpr-trigger');
    if (!triggers.length) return;

    (window.PREFERRED_SOURCE = window.PREFERRED_SOURCE || []).push(function (preferredSource) {
      try {
        preferredSource.init({
          theme: root.dataset.theme === 'day' ? 'light' : 'dark',
          lang: document.documentElement.lang || 'en'
        });
      } catch (e) {
        return;   /* leave the deeplink in place */
      }

      Array.prototype.forEach.call(triggers, function (el) {
        el.dataset.sdk = 'ready';
        el.addEventListener('click', function (ev) {
          ev.preventDefault();
          preferredSource.addPreferredSource();
        });
      });
    });
  }


  /* ---------- Mobile navigation ----------
     Slide-in panel below 1024px. Focus moves into the panel on open and back
     to the button on close, Tab is trapped inside while it is open, Escape
     closes it, and tapping a link closes it before the page scrolls. */
  function initMobileNav() {
    var btn = document.getElementById('menuBtn');
    var panel = document.getElementById('mobileNav');
    var scrim = document.getElementById('mobileNavScrim');
    if (!btn || !panel || !scrim) return;

    var open = false;

    function focusable() {
      return panel.querySelectorAll('a[href], button:not([disabled])');
    }

    function setOpen(next) {
      open = next;
      btn.setAttribute('aria-expanded', next ? 'true' : 'false');
      btn.setAttribute('aria-label', next ? 'Close the menu' : 'Open the menu');
      document.body.setAttribute('data-nav-open', next ? 'true' : 'false');

      if (next) {
        panel.hidden = false;
        scrim.hidden = false;
        /* a frame between unhide and transform, or the transition is skipped */
        window.requestAnimationFrame(function () {
          panel.setAttribute('data-open', 'true');
          scrim.setAttribute('data-open', 'true');
          var first = focusable()[0];
          if (first) first.focus();
        });
      } else {
        panel.removeAttribute('data-open');
        scrim.removeAttribute('data-open');
        btn.focus();
        window.setTimeout(function () {
          if (!open) { panel.hidden = true; scrim.hidden = true; }
        }, 420);
      }
    }

    btn.addEventListener('click', function () { setOpen(!open); });
    scrim.addEventListener('click', function () { setOpen(false); });

    panel.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (ev) {
      if (!open) return;
      if (ev.key === 'Escape') { setOpen(false); return; }
      if (ev.key !== 'Tab') return;

      var items = focusable();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });

    /* Resizing past the breakpoint must not leave the page locked. */
    window.addEventListener('resize', function () {
      if (open && window.innerWidth >= 1024) setOpen(false);
    });
  }

  /* ---------- Scroll reveal ----------
     Two populations of .reveal elements: everything present at first paint
     (scanned below), and blog posts appended later once the feed fetch
     resolves. Both need to go through the same observer, so it's kept in
     a shared variable — observeReveal() is how renderPosts() registers
     each post it appends after initReveal() has already run. */
  var revealObserver = null;
  var revealCount = 0;

  function observeReveal(node) {
    if (!revealObserver) { node.classList.add('in'); return; }
    revealObserver.observe(node);
  }

  function initReveal() {
    var targets = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (node) { node.classList.add('in'); });
      return;
    }
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var delay = Math.min((revealCount % 5) * 80, 320);
        revealCount += 1;
        window.setTimeout(function () { entry.target.classList.add('in'); }, delay);
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach(function (node) { revealObserver.observe(node); });
  }

  /* ---------- Contents rail ---------- */
  function initRail() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.contents a'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var a = map[entry.target.id];
        if (!a || !entry.isIntersecting) return;
        links.forEach(function (other) { other.removeAttribute('aria-current'); });
        a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-15% 0px -70% 0px' });

    Object.keys(map).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) io.observe(section);
    });
  }

  /* Reveal, the rail, the preferred-source button and the mobile nav are all
     independent of the feed and must not wait on it — earlier code chained
     them behind loadFeed().then(), which meant the whole page's fade-in,
     including the hero, stayed invisible until a cross-origin fetch to
     menj.blog finished. That could run to several seconds on a cold
     connection. They now run immediately; the feed loads alongside them. */
  initReveal();
  initRail();
  initPreferredSource();
  initMobileNav();
  loadFeed();
})();
