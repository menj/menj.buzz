# Installing content into MENJ.BUZZ

This is the short version: how to add and edit content, day to day. For
anything else — deployment, the build internals, typography, the
menj.bio integration, encrypting secrets — see `README.md`.

## The loop

Every change follows the same three steps:

1. Edit a file in `data/`
2. Run `./build/build.sh`
3. Upload the whole `menj-buzz/` folder to your web host

That's it. Nothing else needs touching by hand.

## What to edit for what

| Want to change... | Edit this file |
| --- | --- |
| Hero text, bio, any section's heading/intro | `data/content.json` |
| Books, repos, services, archive items, the "Elsewhere" link list | `data/collections.json` |
| Your name, photo, bio facts, site title/description | `data/site.json` |
| Colours | `assets/css/site.css` (the `--c-*` variables near the top) |
| Nav menu items and links | `data/content.json` → `nav` |
| AI crawler permissions, brand terms, FAQs | `data/ai.json` |

**Never hand-edit** `index.html`, `press.html`, `sitemap.html`, `404.html`,
anything under `press/`, or `assets/css/tailwind.css`. All of them are
generated — the next build overwrites whatever you typed into them.

## Adding a press release

A ready-to-fill template lives at `data/press/TEMPLATE.json.example`. It
won't ever show up on the site by itself — the build only reads files
that end in `.json`, and this one deliberately ends in `.json.example`.

1. Copy `data/press/TEMPLATE.json.example`
2. Rename the copy to `YYYY-MM-DD-slug.json`, still inside `data/press/`
3. Replace every `REPLACE —` value, delete the `_note` field, and delete
   any optional block you don't need (`subhead`, `quotes`, `boilerplate`,
   `contact`, `tags`)
4. Run `./build/build.sh`

It shows up on the front page, the press archive, gets its own page, and
gets added to the sitemap — automatically, all from that one file.

## Adding a book, repo, service, or "Elsewhere" link

These live as entries in an array inside `data/collections.json`, not as
separate files — copy an existing entry in the matching array (`books`,
`repos`, `services`, `elsewhere`) and edit the copy. Confirmed field
names, straight from the current data (fields vary between arrays, so
don't guess — check an existing entry in the array you're editing if
something here looks off after a future edit):

```json
// collections.json → books
{ "year": "2026", "title": "Book title", "note": "One line — what it's about",
  "inLanguage": "en", "genre": "Genre", "publisher": "Publisher name", "datePublished": "2026" }

// collections.json → repos
{ "name": "repo-name", "url": "https://github.com/…", "body": "One line describing it",
  "programmingLanguage": "PHP", "applicationCategory": "DeveloperApplication" }

// collections.json → services
{ "kicker": "Short category label", "title": "Service name", "body": "A paragraph describing it" }

// collections.json → elsewhere
{ "label": "Display name", "url": "https://…", "kind": "Short tag, e.g. Photographs" }

// collections.json → archive
{ "label": "Section name", "url": "https://menj.bio/…", "note": "One line describing it" }
```

Books don't carry a URL field at all — there's nowhere on the page a book
entry links out to directly.

## Adding an Instagram photo

Instagram pulls automatically once a token is set up — see "Instagram is
automatic" in `README.md` for that one-time setup. Without a token, or as
a manual supplement, `data/instagram.json` → `posts` is the fallback
manifest. It already has one placeholder entry tagged `"_example"`; the
build ignores any entry with that field, so it's safe to leave in place
as a reference while you add real ones alongside it:

```json
{ "image": "assets/img/your-file.jpg", "url": "https://www.instagram.com/p/SHORTCODE/", "caption": "Short caption, used as the alt text", "date": "YYYY-MM-DD" }
```

Drop the image file into `assets/img/` first, then add the entry.

## Requirements

Node 18 or later to run the build. Python 3 with Pillow is optional —
without it, image derivation (AVIF/WebP) is skipped and the build logs
that, rather than failing.
