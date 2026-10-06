# Changelog

All notable changes to the build system and templates are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/) — see the
Versioning section in `README.md` for what counts as major, minor or patch.

Routine content — a new press release, edited copy, a book or link added in
`data/` — is not a version bump. It goes out through the ordinary
`./build/build.sh` publish flow described in the README. This log tracks
changes to `render.mjs`, `gallery.mjs`, `instagram.mjs`, `ai-discovery.mjs`,
the templates, `.htaccess` and the URL structure.

## [Unreleased]

## [2.4.1] — 2026-09-16

### Fixed

- **The Home link on `press.html` and `sitemap.html` didn't go home** —
  present since the URL migration in 2.0.0. The logo, the "Front page"
  nav link, and the "Home" breadcrumb all used `href="{{base}}"`, which
  is correct for a nested page (`base` is `../`, a valid relative path
  up to root) but renders as `href=""` for a page at the root itself
  (`base` is `''` there), and an empty href resolves to the current
  document, not the site root — so on those two pages, "Home" just
  reloaded the page you were already on. Individual press pages
  (`press/<slug>.html`) were unaffected, since `../` is a valid path
  from one level down. Replaced all nine occurrences (three links ×
  three templates) with a plain `href="/"`, which is correct from any
  depth and no longer depends on `base` being right for this one
  always-the-same-target case.

## [2.4.0] — 2026-09-16

### Added

- `INSTALL.md` — a short, content-only guide (the loop, what-to-edit
  table, and copy-paste-ready shapes for every recurring addition),
  separate from `README.md`'s deeper technical reference. `README.md`
  now points to it up top.
- `data/press/TEMPLATE.json.example` — a filled-in-the-blanks press
  release starting point. Deliberately named so it doesn't end in
  `.json`: `loadReleases()` in `render.mjs` reads every file in
  `data/press/` ending in `.json` and throws if a required field is
  missing, so a template living there under a real `.json` name would
  either crash the build or, worse, publish itself with placeholder
  content if all fields happened to be non-empty.

### Fixed

- The `_note` in `data/instagram.json` claimed there was "no way to fetch
  \[Instagram posts\] automatically from a static site." That's stale —
  `build/instagram.mjs` has done exactly that, via a Professional-account
  token, since before this changelog existed. Corrected to describe the
  manifest as the fallback for when no token is configured, which is
  what it actually is.

## [2.3.2] — 2026-09-16

### Added

- `build/cache-bust.mjs`, run as the last step of `build.sh`. Hashes
  `tailwind.css`, `site.css` and `site.js` and appends `?v=<hash>` to
  every reference across every generated page. Without it, `.htaccess`'s
  one-year cache lifetime for CSS/JS (added in 2.3.0) meant a browser that
  had already fetched the pre-2.3.1 `site.js` would keep serving that
  cached copy indefinitely, regardless of what was actually deployed —
  the 2.3.1 fix could be correct on the server and still appear broken to
  anyone, including the site owner, who'd visited before redeploying.
  Deliberately a separate script rather than folded into `render.mjs`:
  Tailwind's build runs *after* `render.mjs` (it has to — it scans the
  HTML `render.mjs` just wrote for which utility classes survive), so
  hashing `tailwind.css` from inside `render.mjs` would always be reading
  the previous build's file.

## [2.3.1] — 2026-09-16

### Fixed

- **Regression from 2.3.0:** moving `initReveal()` to run immediately (to
  fix the LCP delay) broke the blog feed. `initReveal()` scans the DOM for
  `.reveal` elements once, synchronously, and observes only what's there
  at that moment; blog posts are appended later, asynchronously, once the
  fetch to menj.blog resolves, and `renderPosts()` gives each post the
  same `reveal` class (opacity: 0 until observed). Previously this worked
  by accident, because `initReveal()` used to run *after* the feed
  resolved. Once decoupled, newly-appended posts were never observed and
  stayed invisible indefinitely — rendered, present in the DOM, permanently
  at `opacity: 0`. Fixed properly rather than reverting the LCP fix: the
  observer instance is now kept in a shared variable, and `renderPosts()`
  registers each post it appends with `observeReveal()`, the same one
  `initReveal()` set up for everything else. Verified against a harness
  that executes the real `site.js` with a mock DOM/fetch/IntersectionObserver
  and confirms posts are both rendered and registered with the live
  observer, not just visually plausible.

## [2.3.0] — 2026-09-16

Prompted by a PageSpeed Insights audit (mobile and desktop). Performance
was 70/100 on mobile going in; the dominant issue was a genuine bug, not a
resource-weight problem.

### Fixed

- **The real cause of a 3.6-6.5s LCP element render delay:** `site.js` ran
  `loadFeed().then(function () { initReveal(); initRail(); ...; })` — every
  `.reveal`-class element (opacity: 0 until JS adds `.in`, including the
  hero heading) stayed invisible until a cross-origin fetch to menj.blog's
  WordPress API resolved. On slow connections that fetch alone accounted
  for most of the page's perceived load time. The blog feed is unrelated to
  the reveal animation; `initReveal()`, `initRail()`, `initPreferredSource()`
  and `initMobileNav()` now run immediately, and `loadFeed()` no longer
  gates them.
- The hero's identity-card portrait shipped at its full source resolution
  (440×440) for a slot that renders at 96-112px. `build/images.py` now
  downsizes the portrait derivative to 320×320 — comfortable headroom at
  2-3x DPI — the same way gallery thumbnails were already downsized;
  `width`/`height` on the `<img>` updated to match.

### Added

- `mod_deflate`/`mod_brotli` blocks in `.htaccess` — text-based responses
  (HTML, CSS, JS, JSON, SVG) were served uncompressed.
- `image/avif`, `image/webp` and `text/javascript` to the `mod_expires`
  block — the portrait and `site.js` were caching with no lifetime at all;
  `avif`/`webp` had simply been missed when `png`/`svg` were added, and
  `text/javascript` covers hosts whose MIME config serves JS under that
  type instead of `application/javascript`.
- A `preconnect` to the feed's origin (`data/site.json` → `feed.site`) and
  preloads for the three additional font files the hero's above-the-fold
  text actually depends on beyond the one already preloaded — eyebrow
  (Special Elite), the H1's italic accent word and tagline (Sabon Next LT
  italic), and the lede plus its italic cut (EB Garamond, both cuts).
  Previously only the H1's regular weight was preloaded; the rest were
  only discoverable after `site.css` had loaded and parsed, adding a full
  round-trip to the critical chain Lighthouse measured at up to 4.5s.

### Considered, not done

- Minifying `assets/site.css` and `assets/site.js`: flagged for a combined
  ~12 KiB. Both files are hand-edited source *and* what's served — there's
  no separate dist step — so minifying in place would trade the "edit this
  file directly" workflow for a marginal saving. Left as source.
- The "reduce unused JavaScript" finding on `news.google.com`'s Preferred
  Source SDK: that's Google's own bundle size, not ours to shrink, and it
  already loads `async` behind a command queue designed to tolerate late
  loading — there wasn't a safe change left to make there.

## [2.2.0] — 2026-09-15

### Changed

- Audited every template for text, links, or structure that wasn't yet
  data-driven, and closed each gap. Moved into `content.json`: a new
  `chrome` object for cross-page UI strings (skip link, nav/breadcrumb
  aria-labels, "Sections"/"Contents" headings, the footer's "Switch to"
  text, the Instagram/Flickr/Archive link labels, the marquee's
  aria-label); extended `press` with the detail-page headings; added
  `pressIndex`, `sitemapPage` and `notFound` objects for those pages'
  titles, meta descriptions and copy.
- `data/site.json` → `person` gained `archiveUrl` and `businessName`,
  replacing two hardcoded `https://menj.bio` links and a hardcoded
  "Langgam Fikir Enterprise" that appeared in two templates.
- Removed the `wordmark` key from `content.json`. It was never read
  anywhere — the wordmark is outlined SVG paths, not live text, by design
  (see "The wordmark" in the README) — so the key implied an editability
  that didn't exist.
- Corrected `README.md`: "Collections, identity and structured data"
  described a `<script id="site-data">` block and file-level static markup
  that don't exist in the current codebase (leftover from before the
  render pipeline existed); it also misnamed which data file collections
  live in. Added a full "What's editable, and where" reference table.

### Added

- `build/404.template.html`. The 404 page was the one page still entirely
  hand-authored outside the build; it's now rendered from `content.json`'s
  new `notFound` object like every other page, wired into `render.mjs`.

Left as code, not data, and documented as such: the Day/Night, Pause/Play
and Open/Close-menu button words, which `assets/site.js` sets at runtime —
duplicating two-word toggle states into JSON has no real editing value and
only adds a second place that has to match the script.

## [2.1.0] — 2026-09-15

### Added

- `build/secrets.mjs` — encrypts/decrypts any JSON file (AES-256-CBC, PBKDF2
  key derivation, salted and IV'd per encryption) via `crypto-js`, as a
  library for the build and as a CLI (`npm run secrets:encrypt` /
  `secrets:decrypt`).
- `crypto-js@4.2.0` as the project's first real npm dependency. Note: it's
  no longer actively maintained upstream — used here because it was already
  on hand, documented as a caveat rather than a silent choice.
- `data/secrets.instagram.json.enc` as an optional, commit-safe alternative
  to the gitignored plaintext token file. `build/instagram.mjs` now checks,
  in order: `IG_ACCESS_TOKEN` env var, the encrypted file (with
  `SECRETS_KEY` set), then the plaintext file — and re-encrypts back to
  whichever source it read from after each successful token refresh, the
  same way it already rewrote the plaintext file.
- "Encrypting the token" section in `README.md`; extended the "Structure"
  diagram and `.gitignore` comment to match.

## [2.0.0] — 2026-09-15

### Changed

- **Breaking:** every page now resolves to an explicit `.html` file instead
  of a folder with a trailing slash: `/press/` → `/press.html`,
  `/press/<slug>/` → `/press/<slug>.html`, `/sitemap/` → `/sitemap.html`.
  Updated `render.mjs` (URL generation, output paths, JSON-LD `@id`s and
  breadcrumbs), all four templates, and `tailwind.config.js`'s content globs
  to match.
- `.htaccess` no longer force-adds a trailing slash to extensionless URLs.
  It now 301-redirects the old folder-style URLs to their `.html`
  replacement, so links and indexed pages made before this version keep
  resolving.
- `ai-discovery.mjs`'s `developer-ai.txt` output pointed its HTML sitemap
  link at the old `/sitemap/` path.

### Fixed

- `404.html`'s "See the sitemap" link, hand-authored and not
  template-generated, still pointed at `/sitemap/`.
- `README.md` described a `sitemap/` output directory and `/press/<slug>/`
  URLs that no longer exist, and referenced `css/` and `js/` directories
  the project has never had — everything lives under `assets/`.

### Added

- `package.json`, giving the project a real, bumpable version number
  (`npm version patch|minor|major`).
- This changelog, and a Versioning section in `README.md` explaining the
  policy above.

## [1.0.0] — 2026-08-20

### Added

- Initial public release: the flat-file static build (`render.mjs`) driven
  by JSON in `data/`; the press release system with per-release
  `NewsArticle` structured data; the AI discovery file stack (`llms.txt`,
  `ai.txt`, `ai.json`, `identity.json` and related files); menj.bio identity
  integration at build time; Flickr and Instagram photo rows; HTML and XML
  sitemaps; self-hosted variable fonts; and the night/day theme.
