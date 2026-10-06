#!/usr/bin/env node
/* =========================================================================
   cache-bust.mjs — appends a content hash to every reference to the site's
   three cacheable static assets (tailwind.css, site.css, site.js), across
   every generated HTML page.

   .htaccess gives CSS and JS a one-year cache lifetime. Without this, a
   browser that already fetched the old site.js once would go on serving
   that cached copy for up to a year, regardless of what's actually on the
   server — a real, reproducible staleness trap, not a hypothetical one.
   The hash changes only when a file's content changes, so a cached copy is
   invalidated exactly when it needs to be and never otherwise.

   Deliberately its own script, run as the last step in build.sh, after the
   Tailwind build: render.mjs runs before Tailwind (it has to — Tailwind
   scans the HTML render.mjs just wrote for which utility classes are
   used), so hashing tailwind.css from inside render.mjs would always be
   one build behind. Run from build.sh, or directly:
   node build/cache-bust.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const at = (...parts) => resolve(root, ...parts);

const ASSETS = ['assets/css/tailwind.css', 'assets/css/site.css', 'assets/js/site.js'];
const SKIP_DIRS = new Set(['build', 'data', 'assets', 'node_modules', '.git']);

function hash(path) {
  return createHash('sha256').update(readFileSync(at(path))).digest('hex').slice(0, 10);
}

function findHtmlFiles(dir, out) {
  for (const name of readdirSync(at(dir))) {
    if (dir === '.' && SKIP_DIRS.has(name)) continue;
    const rel = dir === '.' ? name : `${dir}/${name}`;
    if (statSync(at(rel)).isDirectory()) {
      findHtmlFiles(rel, out);
    } else if (extname(name) === '.html') {
      out.push(rel);
    }
  }
  return out;
}

const versions = Object.fromEntries(ASSETS.map((path) => [path, hash(path)]));
const files = findHtmlFiles('.', []);
let touched = 0;

for (const file of files) {
  let text = readFileSync(at(file), 'utf8');
  let changed = false;
  for (const [asset, version] of Object.entries(versions)) {
    /* matches a bare reference or one already versioned, so a re-run refreshes the hash */
    const pattern = new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\?v=[0-9a-f]+)?"', 'g');
    const next = text.replace(pattern, `${asset}?v=${version}"`);
    if (next !== text) {
      text = next;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(at(file), text);
    touched += 1;
  }
}

console.log(`Cache-busted ${ASSETS.length} asset(s) across ${touched} page(s)`);
