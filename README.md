# MENJ.BUZZ

Personal site for Mohd Elfie Nieshaem Juferi. Static, flat-file, no framework and
no database. Content lives as JSON in `data/`; a small Node script renders it
into a single static HTML page.

Current version: see `package.json`. Version history: `CHANGELOG.md`. To
add or edit content without reading the rest of this file: `INSTALL.md`.

## Structure

```
menj-buzz/
├── index.html  press.html  sitemap.html  404.html  robots.txt  sitemap.xml
│   site.webmanifest                              every page ends in .html
├── llms.txt  llm.txt  llms.html  ai.txt  ai.json  identity.json
│   brand.txt  faq-ai.txt  developer-ai.txt  robots-ai.txt   GENERATED
├── package.json  CHANGELOG.md  INSTALL.md  .htaccess  .gitignore
├── assets/
│   ├── site.css            design tokens, theme, components
│   ├── tailwind.css        GENERATED
│   ├── site.js             theme, marquee, rail, feed
│   ├── fonts/              Sabon Next LT, EB Garamond, Special Elite
│   └── img/                logo, favicon, portrait, social card, gallery
├── data/                   the only files you edit
│   ├── site.json           metadata, identity, feeds, Flickr
│   ├── content.json        all prose
│   ├── collections.json    books, repos, services, links, archive
│   ├── ai.json             permissions, brand terms, FAQs
│   ├── instagram.json      manifest and handle
│   ├── secrets.instagram.json(.enc)  token — plaintext gitignored, .enc committable
│   ├── cache-*.json        GENERATED, safe to delete
│   └── press/              one JSON per release, plus TEMPLATE.json.example
├── press/                  GENERATED — one <slug>.html per release
└── build/                  build.sh, render.mjs, gallery.mjs, instagram.mjs,
                            secrets.mjs, cache-bust.mjs, ai-discovery.mjs,
                            images.py, templates, config
```

Four directories at the root, one of them generated output and one of them
development tooling. Stylesheets, scripts, fonts and images all live under
`assets/`; every image of any kind lives in `assets/img/`. `npm install`
creates a gitignored `node_modules/` for the one dependency, `crypto-js`,
used only by `build/secrets.mjs` — nothing else in the build needs it.

## Editing content

Everything on the page comes from the three JSON files in `data/`. Edit one,
run the build, and the page is regenerated:

```sh
./build/build.sh
```

`render.mjs` reads the JSON and `build/index.template.html` and writes a fully
static `index.html`, plus `sitemap.xml` and `robots.txt`. The `Person` JSON-LD
is assembled from `data/site.json`, so the structured data and the visible page
can never drift apart. Nothing is assembled in the browser except the blog feed.

**Never edit `index.html`, `press.html`, `sitemap.html`, `404.html`,
`press/*.html`, `assets/tailwind.css`, `sitemap.xml` or `robots.txt`
directly.** Every one of them is generated; the next build overwrites
whatever you typed in by hand. Their sources are the matching files under
`build/*.template.html` and the JSON in `data/`.

### Writing content

Prose fields in `data/` are Markdown, not HTML. The parser is about forty lines
in `render.mjs` and handles the inline set only, since the content is prose
rather than documents:

| You write | You get |
| --- | --- |
| `*emphasis*` or `_emphasis_` | italic |
| `**strong**` | bold |
| `***both***` | bold italic |
| `[label](https://example.com)` | a link, external ones opening in a new tab |
| `` `code` `` | monospace |
| `==highlight==` | italic in the accent colour — the one house extension, used for the standfirst |
| `--` and `...` | em dash and ellipsis |

Raw HTML still passes through untouched, so anything already written that way
keeps working. Markdown applies to `{{{triple-brace}}}` fields; `{{double}}`
fields are escaped and stay literal, which is why headlines and meta
descriptions cannot pick up stray formatting.

The plain-text outputs strip the marks rather than passing them on, so
`llms.txt`, `ai.txt` and the JSON-LD descriptions read as clean prose.

### Template syntax

`build/index.template.html` uses a deliberately small syntax, implemented in
`render.mjs`:

| Token | Meaning |
| --- | --- |
| `{{path.to.value}}` | HTML-escaped value |
| `{{{path.to.value}}}` | raw, for strings carrying markup |
| `{{#each path}} … {{/each}}` | iterate; `{{.}}`, `{{field}}`, `{{@index}}`, `{{@first}}`, `{{@last}}` |
| `{{#if path}} … {{else}} … {{/if}}` | truthiness; arrays test on length |

Collections are namespaced under `db` (`{{#each db.books}}`), prose sits at the
top level (`{{about.eyebrow}}`), and `site`, `person` and `feed` come from
`data/site.json`.

## Deploying

Run `./build/build.sh`, then upload the contents of `menj-buzz/` to the web
root. Nothing is compiled on the server. `build/` and `data/` are source, not
runtime: both can be excluded from the upload, though keeping `data/` costs
nothing and makes the deployed copy self-describing.

## Collections, identity and structured data

Books, repositories, service blurbs, the archive and the link directory all
live in `data/collections.json`, under `db`. Add an entry there and it
appears on the page — nothing else to touch.

The biography, hero copy and every section's prose live in `data/content.json`.
Identity fields — name, image, alumnus record, the `sameAs` list the `Person`
JSON-LD is built from — live in `data/site.json`. All of it renders into the
static HTML at build time, so the visible page, the meta tags and the
structured data are the same JSON and can't drift apart from one another.
Search engines and link unfurlers read the served HTML directly; nothing on
the page depends on JavaScript except the live blog feed.

## What's editable, and where

Every page is generated from the JSON in `data/`; the tables below are the
complete map. If it isn't in one of these files, it's a layout choice in
`build/*.template.html`, not content — see "Template syntax" above.

**Text and links, section by section:**

| Section | Prose, labels and links | List items |
| --- | --- | --- |
| Header, nav, footer chrome | `content.json` → `nav`, `chrome`, `footer` | — |
| Hero | `content.json` → `hero` | button list is inline in `hero.buttons` |
| Identity card (the quick-facts list) | — | `collections.json` → `db.facts` |
| About | `content.json` → `about` | — |
| What I do | `content.json` → `services` (eyebrow/heading) | `collections.json` → `db.services` |
| Books | `content.json` → `books` | `collections.json` → `db.books` |
| Writing | `content.json` → `writing` | live from `menj.blog`, see "The blog feed" |
| Press | `content.json` → `press` | `data/press/*.json`, one file per release |
| Code | `content.json` → `code` | `collections.json` → `db.repos` |
| Photographs | `content.json` → `photographs` | `data/instagram.json`, `site.json` → `flickr` |
| Archive | `content.json` → `archive` | `collections.json` → `db.archive` |
| Elsewhere | `content.json` → `elsewhere` | `collections.json` → `db.elsewhere` |
| Currently (CTA) | `content.json` → `cta` | button list inline in `cta.buttons` |
| Marquee banner | — | `collections.json` → `db.marquee` |
| Press index, sitemap, 404 pages | `content.json` → `pressIndex`, `sitemapPage`, `notFound` | — |

**Everything else:**

| What | Lives in |
| --- | --- |
| Name, portrait, bio facts, `sameAs`, `Person` JSON-LD | `site.json` → `person` |
| Site title, description, canonical, locale, theme colours, OG/Twitter tags | `site.json` → `meta` |
| Colours — every one, night theme and day theme | `assets/site.css` → the `--c-*` custom properties in `:root` |
| Fonts and type sizes | `assets/site.css`; see "Typography" |
| AI crawler permissions, brand terms, FAQs | `data/ai.json` |
| Instagram token (for the automated pull) | `data/secrets.instagram.json(.enc)`, or `IG_ACCESS_TOKEN` |
| Section order, page layout, HTML structure | `build/*.template.html` — the one thing you edit for layout, not content |
| Wordmark colour | CSS token, as above |
| Wordmark text | fixed by design — see "The wordmark" |
| Day/Night, Pause/Play, Open/Close-menu button words | `assets/site.js` — see note below |

Three pairs of words — the theme switch (Day/Night), the marquee toggle
(Pause/Play), and the mobile-menu button (Open/Close the menu) — live in
`assets/site.js`, which sets whichever word matches the current state at
runtime. They're deliberately not duplicated into `content.json`: doing so
would only create a second place that has to be kept in sync with the
script for two-word toggle labels, not real editorial content.

## Publishing a press release

Drop a JSON file into `data/press/` and run `./build/build.sh`. Nothing else.
The build will list it on the front page, list it in the archive at
`/press.html`, give it its own page at `/press/<slug>.html` with
`NewsArticle` structured data, and add it to `sitemap.xml`.

`data/press/TEMPLATE.json.example` is a filled-in-the-blanks starting
point — copy it, rename the copy so it ends in `.json`, and fill it in.
It's safe to leave in place: the build only reads files ending in
`.json`, and this one deliberately doesn't.

Releases are ordered by `dateline.date`, not by filename, though naming files
`YYYY-MM-DD-slug.json` keeps the directory readable.

### Format

```json
{
  "slug": "url-segment",
  "headline": "One sentence, no full stop",
  "subhead": "Optional second line.",
  "dateline": { "city": "Kuala Lumpur", "date": "2026-09-01" },
  "summary": "One or two sentences. Used as the meta description, the archive blurb and the social description.",
  "body": [
    "First paragraph. The build prefixes it with the dateline automatically.",
    "Second paragraph.",
    "Third paragraph."
  ],
  "quotes": [
    { "text": "The quotation, without quote marks.", "attribution": "Name, title, organisation" }
  ],
  "boilerplate": "About the organisation.",
  "contact": { "name": "", "role": "", "email": "", "url": "" },
  "tags": ["publishing"]
}
```

`slug`, `headline`, `summary`, `body` and `dateline.date` are required; the
build fails with the filename and the missing field if one is absent. Everything
else is optional and its block is omitted when absent. Strings in `body`,
`subhead`, `quotes[].text` and `boilerplate` may carry inline markup such as
`<em>`; headline and summary are escaped, since they also go into metadata.

## menj.bio integration

menj.bio is the authoritative identity record, so this site defers to it rather
than restating it. At build time `render.mjs` fetches
`https://menj.bio/identity.json` and folds two things into the `Person` node:

- **External identifiers** — Wikidata (Q136687746) and VIAF are emitted as
  `identifier` `PropertyValue` entries, which is what ties this page to the
  authority files rather than merely linking to them.
- **Profiles this site does not list** — Google Scholar, Gravatar, Facebook,
  Instagram, Flickr, Quora and the rest are merged into `sameAs`, deduplicated
  against the local list, with the authority files sorted to the front.

The archive itself is declared as a `WebSite` / `ArchiveComponent` node, and the
person is marked `subjectOf` it.

The fetch is build-time, not runtime: menj.bio sends no CORS header, and a
published page should never depend on another host being reachable. The response
is cached to `data/cache-menj-bio-identity.json`, so builds work offline and a
failed fetch cannot silently drop identifiers that were present yesterday. The
build prints which path it took.

The visible Archive section links the eight sections of menj.bio and is driven
by `archive` in `data/collections.json`.

**Deliberately not integrated:** `library.yaml` lists all 109 documents and would
make an automatic "recent additions" feed easy, but the archive holds material
of several kinds, including personal work that does not belong on a
professional front page. If you want that feed, it should be filtered to named
categories rather than pulling whatever is newest.

## Google Preferred Source

The closing section carries an "Add as a preferred source on Google" control,
ported from the G Preferred Reader plugin's advanced method. Google's official
SDK (`news.google.com/swg/js/v1/publisher.js`) is loaded with
`preferred-sources-control="manual"`, which stops it scanning the DOM and
drawing its own badge, and the site's own pill button drives the same flow.

The anchor's `href` is the plain deeplink, so the control still works with
JavaScript off or if the SDK fails to load; the click handler intercepts only
once the SDK reports ready. The theme passed to `init()` follows the site's own
day/night setting.

Configure in `data/site.json`:

```json
"preferredSource": {
  "enabled": true,
  "domain": "menj.buzz",
  "label": "Add as a preferred source on Google",
  "note": "Google shows preferred sources higher in Top stories for people who add them."
}
```

Set `enabled` to false and the button, the note and the SDK script all
disappear from the build. Note that the SDK is the site's only third-party
request; everything else is self-hosted.

## Photo rows

The Images section is one unified grid of eight tiles: the first row of four
comes from Instagram, the second row of four from Flickr, with no visual
distinction between them. If either source has fewer than four, the other
backfills so the grid never renders a ragged half-row. Everything is static
markup with local images. Nothing is fetched in the visitor's browser and neither platform
gets a tracking script on the page.

**Flickr is automatic.** `build/gallery.mjs` reads the public feed, which needs
no API key but is keyed on the NSID (`37664438@N00`) rather than the `menj`
alias. Photos are downloaded into `assets/img/`, resized to 480px, and
converted to AVIF and WebP. The response is cached, so a Flickr outage keeps
the previous row rather than emptying it. Configure in `data/site.json`:

```json
"flickr": { "enabled": true, "nsid": "37664438@N00", "count": 8, "tags": "" }
```

The `tags` field filters the feed, which is useful if the photostream mixes
work and personal shots.

**Instagram is automatic**, through the Instagram API with Instagram Login,
which requires a Professional (Business or Creator) account.

The awkward part of that API is the token: Meta issues one valid for about 60
days. No server is needed to keep it alive, because **the build refreshes it**.
Every run of `build.sh` calls the refresh endpoint, receives a fresh 60-day
token, and writes it back to wherever it read it from — the encrypted file if
that's the source, the plaintext one otherwise. Building at any point inside
the window rolls the clock forward indefinitely. Only a two-month gap between
builds breaks it, and the fix is pasting one new token.

### One-time setup

1. At developers.facebook.com, create an app and add the Instagram product.
2. Connect your account through Instagram Login and generate a long-lived token.
3. `cp data/secrets.instagram.json.example data/secrets.instagram.json` and
   paste the token into it. The file is gitignored and is rewritten on every
   build.

Alternatively, set `IG_ACCESS_TOKEN` in the environment and skip the file
entirely — useful in CI, where the token belongs in a secret manager rather
than on disk at all.

### Encrypting the token

To keep the token in the repository instead of gitignored on disk — a laptop
that isn't backed up, a shared machine — encrypt it with `build/secrets.mjs`
(AES-256-CBC, PBKDF2 key derivation, via [crypto-js](https://github.com/brix/crypto-js) —
note crypto-js is no longer actively maintained upstream; it's used here
because it was already on hand, not because it's the current recommendation):

```sh
export SECRETS_KEY="a long passphrase, not committed anywhere"
npm run secrets:encrypt -- data/secrets.instagram.json
```

That writes `data/secrets.instagram.json.enc` — safe to commit — and leaves
the plaintext file in place; delete it once you've confirmed the encrypted
one works. `SECRETS_KEY` has to be set in the environment at build time
(export it in your shell profile, or set it as a CI secret); with it present,
`build/instagram.mjs` reads and re-encrypts the token from the `.enc` file
automatically, the same way it already reads and rewrites the plaintext one.
Precedence is `IG_ACCESS_TOKEN` env var, then the encrypted file, then the
plaintext file.

To decrypt for inspection: `npm run secrets:decrypt --
data/secrets.instagram.json.enc` prints the JSON to stdout; add a third
argument to write it to a file instead. Both commands read `SECRETS_KEY` from
the environment and work on any JSON file, not just this one.

Videos and reels contribute their still frame; carousels contribute their first
image. Captions are trimmed to the first line with hashtags stripped, and that
line becomes the alt text.

### Manifest fallback

With no token present the build falls back to the manual list in
`data/instagram.json` and says so in the log. To use it: drop an image into
`assets/img/`, add an entry, rebuild.

```json
{
  "image": "assets/img/kl-evening.jpg",
  "url": "https://www.instagram.com/p/SHORTCODE/",
  "caption": "Evening over Kuala Lumpur",
  "date": "2026-09-10"
}
```

Entries whose image file is missing are skipped with a note rather than
rendering a broken tile, and the row disappears entirely when there are none.

## The blog feed

The Writing section is the one part assembled in the browser, because posts
change without a rebuild. It reads the WordPress REST API on menj.blog, which
sends an `Access-Control-Allow-Origin` header for cross-origin GET, so no proxy
or key is involved. Results are cached in `sessionStorage`.

Configure it in `data/site.json`:

```json
"feed": {
  "endpoint": "https://menj.blog/wp-json/wp/v2/posts",
  "count": 6,
  "cacheMinutes": 30
}
```

Appending `&categories=112` to the endpoint filters to Apologetics; `102` is
SEO and `137` is Malaysia. If the feed cannot be reached the section shows a
link to the blog.

## The wordmark

`assets/img/logo.svg` is MENJ.BUZZ set in Sabon Next LT and converted to outlines,
so it renders identically whether or not the webfont has loaded and stays sharp
at any size. The build inlines it into the header of every page so it can take
its colours from CSS: MENJ uses `currentColor`, the separating point uses
`--c-accent`, and BUZZ sits back at 45 per cent. Size is controlled by the
`.wordmark` height in `assets/site.css`, not by the SVG. Its colour is a CSS
token like everything else and lives in `assets/site.css`; its text does not
live in `data/` at all, deliberately — outlined paths, not live text, are what
make it render the same with or without the webfont, so the wording is fixed
until the SVG is regenerated (below). An earlier `wordmark` key in
`content.json` implied otherwise and did nothing; it's been removed.

`assets/img/favicon.svg` is the M from the same face, in accent on ink.

To regenerate either after a wording change, outline the text from the desktop
TTFs with fontTools rather than setting live text in the SVG — live text would
depend on the font being installed on the viewer's machine.

## Images

The portrait is served through a `<picture>` element: AVIF first, WebP second,
PNG as the final fallback. 8.6 KB instead of 133 KB, a 94 per cent saving, with
the alpha channel intact in all three.

`build/images.py` derives the AVIF and WebP copies from the PNG and runs from
`build.sh` before the render. It regenerates only when the PNG is newer, and
skips silently with a message if Pillow is not installed, so the build never
fails over an optional dependency. The PNG is the source of truth; edit it and
rebuild.

```sh
pip install pillow pillow-avif-plugin
```

The social card stays PNG deliberately. Several link unfurlers still do not
accept AVIF for `og:image`, and a card that fails to render is worth more than
a few kilobytes saved. The favicon and wordmark are SVG, which needs no raster
alternative.

## Typography

Three faces, all self-hosted from `assets/fonts/`, so the site makes no
third-party requests at all:

- **Sabon Next LT** — headings and body. Four subsetted woff2 files (roman,
  italic, bold, bold italic), around 34 KB each.
- **Special Elite** — the small uppercase labels, eyebrows, datelines and
  marquee. One file, 56 KB. Replaces JetBrains Mono and with it the last
  Google Fonts request.
- **EB Garamond** — the reading text: paragraphs, lists, table values, quotes.
  Two variable files, roman and italic. It also remains the first fallback for
  the display stack, so if Sabon cannot be served from a given host for licence
  reasons the page degrades to a related open-licensed face rather than to a
  system serif.

Three faces, three jobs: Sabon sets the display sizes, Garamond sets the text,
Special Elite sets the labels. Garamond runs small on screen, so body size is
19px against the 17.5px it was at in Sabon; numerals are lining inside the
identity table and the year columns, where they align against labels, and
old-style elsewhere.

**Licensing.** EB Garamond and Special Elite are under the SIL Open Font
License; their licence files are in the original packages. Sabon Next LT is
commercial font software from Linotype/Monotype.
The webfont files are included because this site is the licensee's own; they
must not be redistributed, committed to a public repository, or served from a
domain the licence does not cover. Check the webfont clause of your licence
before deploying to any additional host.

To reissue the subsets from the desktop TTFs:

```sh
pyftsubset SabonNextLT.ttf --output-file=assets/fonts/sabon-next-lt-regular.woff2 \
  --flavor=woff2 --no-hinting --desubroutinize \
  --unicodes="U+0000-00FF,U+0100-017F,U+0180-024F,U+1E00-1EFF,U+2000-206F,U+20A0-20BF,U+2122,U+2190-2193,U+2212,U+2726,U+FB00-FB04" \
  --layout-features="kern,liga,clig,onum,pnum,tnum,lnum,frac"
```

## Rebuilding the CSS

`assets/tailwind.css` contains only the utility classes present in `index.html` and
`assets/site.js` at build time. A class that was not present will do nothing until
the stylesheet is rebuilt:

```sh
./build/build.sh
```

Requires Node. Nothing else in the site depends on it.

`build/cache-bust.mjs` runs as the last step of `build.sh`, after this. It
hashes `tailwind.css`, `site.css` and `site.js` and appends `?v=<hash>` to
every reference to them across every generated page, so a browser that
cached the old file fetches the new one the moment its content actually
changes — necessary because `.htaccess` gives those three a one-year cache
lifetime. Nothing to run by hand; every `build.sh` run updates it.

## Design notes

- Two themes, `night` and `day`, selected by the switch in the header and the
  footer. The choice persists to `localStorage`; with nothing stored the site
  follows `prefers-color-scheme`. A small inline snippet in `<head>` applies the
  theme before first paint so there is no flash.
- Every colour is a CSS variable in `assets/site.css`. Changing the palette is one
  edit there; Tailwind's colour names resolve to the same variables.
- The Contents rail appears at 1600 px and wider, where there is margin outside
  the centred column, and marks the section in view with `aria-current`.
- Accessibility: skip link, visible focus rings, `aria-pressed` on the theme
  switches, a pause control on the marquee, and `prefers-reduced-motion`
  honoured throughout.

## Before going live

- Point the canonical host at the production domain if it is not `menj.buzz`.
  The host appears in the canonical link, the Open Graph and Twitter tags, the
  `Person` JSON-LD, `robots.txt` and `sitemap.xml`.
- `lastmod` in `sitemap.xml` is set by the build; rebuild rather than editing the file.
- `.htaccess` already sets long cache lifetimes (`mod_expires`) and
  compression (`mod_deflate`/`mod_brotli`) for static assets, and short ones
  for the HTML itself — nothing to configure at the host, provided it runs
  Apache with those modules available. On a different server, replicate the
  same rules in its own config.

## Versioning

This project follows [Semantic Versioning](https://semver.org/): the current
version lives in `package.json`, and `CHANGELOG.md` records what changed at
each one, in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

The version tracks the build system in `build/` and the templates — not the
prose. Publishing a press release or editing copy in `data/` is ordinary
content work and goes out through `./build/build.sh` without a version bump.
Bump the version when `render.mjs`, the templates, `.htaccess` or the URL
structure change:

```sh
npm version patch   # fixes, small template tweaks
npm version minor   # new feature or section that doesn't break existing pages
npm version major   # breaking change to the public URL structure or output
```

Each runs without a git repository present; add `--no-git-tag-version` if a
git tag isn't wanted. Add a matching entry to `CHANGELOG.md` under the new
version when you do.
