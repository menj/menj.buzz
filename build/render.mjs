#!/usr/bin/env node
/* =========================================================================
   render.mjs — flat-file build

   Reads the JSON in data/ and the template in build/, and writes a fully
   static index.html. Nothing on the page is assembled in the browser any
   more, so the served HTML carries the complete text for crawlers, readers
   with JavaScript off, and link unfurlers.

   The one exception is the blog feed, which is live by nature; its
   configuration is emitted into a small JSON block the runtime script reads.

   Template syntax, deliberately tiny:
     {{path.to.value}}      HTML-escaped
     {{{path.to.value}}}    raw, for strings that carry markup
     {{#each path}} … {{/each}}
                            iterate an array; inside, {{.}} is the item
                            itself, {{field}} a property, {{@index}} the
                            position, {{@first}} / {{@last}} booleans
     {{#if path}} … {{else}} … {{/if}}
                            truthiness, arrays test on length
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { writeDiscoveryFiles } from './ai-discovery.mjs';
import { buildGallery } from './gallery.mjs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const at = (...parts) => resolve(root, ...parts);

/* ---------- data ---------- */
const readJSON = (path) => JSON.parse(readFileSync(at(path), 'utf8'));

const site = readJSON('data/site.json');
const content = readJSON('data/content.json');
const collections = readJSON('data/collections.json');
const ai = readJSON('data/ai.json');
const instagram = existsSync(at('data/instagram.json')) ? readJSON('data/instagram.json') : null;

const gallery = await buildGallery({ root, flickr: site.flickr, instagram });

const model = { ...content, db: collections, site: site.meta, person: site.person, feed: site.feed, preferred: site.preferredSource || { enabled: false } };


/* ---------- press releases ----------
   One JSON file per release in data/press/. Drop a file in, run the build,
   and it is published: listed on the front page, listed in the archive,
   given its own page with NewsArticle structured data, and added to the
   sitemap. Filenames are ignored for ordering; dateline.date decides. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function displayDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function loadReleases() {
  const dir = at('data/press');
  if (!existsSync(dir)) return [];

  const base = site.meta.canonical.replace(/\/$/, '');

  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const release = JSON.parse(readFileSync(resolve(dir, name), 'utf8'));

      const missing = ['slug', 'headline', 'summary', 'body', 'dateline']
        .filter((field) => !release[field]);
      if (missing.length) {
        throw new Error(`data/press/${name}: missing ${missing.join(', ')}`);
      }
      if (!release.dateline.date) throw new Error(`data/press/${name}: dateline.date is required`);

      release.file = name;
      release.url = `${base}/press/${release.slug}.html`;
      release.displayDate = displayDate(release.dateline.date);
      release.leadParagraph = release.body[0];
      /* The guide warns against overlong titles: Google truncates them. Suffix the
         site name only when the headline leaves room for it. */
      release.pageTitle = release.headline.length > 55
        ? release.headline
        : release.headline + ' — ' + site.meta.siteName;
      release.restParagraphs = release.body.slice(1);

      return release;
    })
    .sort((a, b) => (a.dateline.date < b.dateline.date ? 1 : -1));
}

const releases = loadReleases();

/* ---------- engine ---------- */
const escapeHTML = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');


/* ---------- inline Markdown ----------
   The content JSON is prose, not documents, so this handles the inline set and
   nothing more: emphasis, strong, links, code, and a couple of typographic
   niceties. Anything outside that passes through untouched, which means the
   HTML already written in the data files keeps working.

   Order matters: code spans are extracted first and restored last, so markup
   inside backticks is never interpreted. `{{{triple}}}` fields run through
   this; `{{double}}` fields are escaped and do not. */
function markdown(input) {
  if (input == null) return input;
  let text = String(input);
  if (!/[*_`\[=]|--|\.\.\./.test(text)) return text;   /* nothing to do */

  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(code);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });

  text = text
    /* [label](url) — external links open in a new tab, internal ones do not */
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
      const external = /^https?:/i.test(href);
      const attrs = external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${href}"${attrs} class="link-u hover:text-accent transition-colors">${label}</a>`;
    })
    /* ==highlight== is the one house extension: italic in the accent colour,
       used for the standfirst and the closing statement */
    .replace(/==(?=\S)([^=]+?)(?<=\S)==/g, '<span class="italic text-accent">$1</span>')
    /* ***both*** before **strong** before *emphasis* */
    .replace(/\*\*\*(?=\S)([^*]+?)(?<=\S)\*\*\*/g, '<em><strong>$1</strong></em>')
    .replace(/\*\*(?=\S)([^*]+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, '<em>$1</em>')
    /* _underscore_ emphasis, but not inside_words_like_this */
    .replace(/(^|[\s(])_(?=\S)([^_]+?)(?<=\S)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    /* typography: em dash, ellipsis */
    .replace(/(\s)--(\s)/g, '$1\u2014$2')
    .replace(/\.\.\./g, '\u2026');

  return text.replace(/\u0000(\d+)\u0000/g, (_m, i) =>
    '<code class="font-mono text-[0.9em]">' + escapeHTML(codes[Number(i)]) + '</code>');
}

function lookup(scope, path) {
  if (path === '.') return scope.$item;
  if (path === '@index') return scope.$index;
  if (path === '@first') return scope.$first;
  if (path === '@last') return scope.$last;

  const parts = path.split('.');
  let node = scope.$item !== undefined && parts[0] in Object(scope.$item) ? scope.$item : scope.$root;
  for (const part of parts) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
}

const truthy = (value) =>
  Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== false && value !== '';

function render(template, scope) {
  let out = '';
  let i = 0;

  while (i < template.length) {
    const open = template.indexOf('{{', i);
    if (open === -1) { out += template.slice(i); break; }
    out += template.slice(i, open);

    /* block? */
    if (template.startsWith('{{#each ', open)) {
      const head = template.indexOf('}}', open);
      const path = template.slice(open + 8, head).trim();
      const [body, after] = takeBlock(template, head + 2, 'each');
      const items = lookup(scope, path);
      if (Array.isArray(items)) {
        items.forEach((item, index) => {
          out += render(body, {
            $root: scope.$root,
            $item: item,
            $index: index,
            $first: index === 0,
            $last: index === items.length - 1
          });
        });
      }
      i = after;
      continue;
    }

    if (template.startsWith('{{#if ', open)) {
      const head = template.indexOf('}}', open);
      const path = template.slice(open + 6, head).trim();
      const [body, after] = takeBlock(template, head + 2, 'if');
      const split = splitElse(body);
      out += render(truthy(lookup(scope, path)) ? split.yes : split.no, scope);
      i = after;
      continue;
    }

    /* interpolation */
    const raw = template.startsWith('{{{', open);
    const close = template.indexOf(raw ? '}}}' : '}}', open);
    const path = template.slice(open + (raw ? 3 : 2), close).trim();
    const value = lookup(scope, path);
    if (value !== undefined && value !== null) out += raw ? markdown(value) : escapeHTML(value);
    i = close + (raw ? 3 : 2);
  }

  return out;
}

/* Returns [innerBody, indexAfterClosingTag], honouring nesting. */
function takeBlock(template, start, kind) {
  const openTag = '{{#' + kind + ' ';
  const closeTag = '{{/' + kind + '}}';
  let depth = 1;
  let cursor = start;

  while (depth > 0) {
    const nextOpen = template.indexOf(openTag, cursor);
    const nextClose = template.indexOf(closeTag, cursor);
    if (nextClose === -1) throw new Error('Unclosed {{#' + kind + '}} block');
    if (nextOpen !== -1 && nextOpen < nextClose) { depth += 1; cursor = nextOpen + openTag.length; continue; }
    depth -= 1;
    if (depth === 0) return [template.slice(start, nextClose), nextClose + closeTag.length];
    cursor = nextClose + closeTag.length;
  }
  throw new Error('Unclosed {{#' + kind + '}} block');
}

function splitElse(body) {
  const marker = body.indexOf('{{else}}');
  if (marker === -1) return { yes: body, no: '' };
  return { yes: body.slice(0, marker), no: body.slice(marker + 8) };
}


/* ---------- menj.bio integration ----------
   menj.bio is the biographical archive and the authoritative identity record.
   Rather than restate that record here and let the two drift, the build fetches
   its identity.json and folds the parts this site should carry into the Person
   node: the external identifiers (Wikidata, VIAF, Google Scholar) and any
   profile this site does not already list.

   The fetch is build-time, not runtime: menj.bio sends no CORS header, and a
   published page should not depend on another host being up. The result is
   cached in data/ so a build works offline and so a failed fetch never
   silently drops identifiers that were there yesterday. */
const BIO_IDENTITY_URL = 'https://menj.bio/identity.json';
const BIO_CACHE = 'data/cache-menj-bio-identity.json';

async function loadBioIdentity() {
  try {
    const res = await fetch(BIO_IDENTITY_URL, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    writeFileSync(at(BIO_CACHE), JSON.stringify(data, null, 2));
    console.log('Fetched identity from menj.bio');
    return data;
  } catch (err) {
    if (existsSync(at(BIO_CACHE))) {
      console.log('menj.bio unreachable (' + err.message + ') — using cached identity');
      return JSON.parse(readFileSync(at(BIO_CACHE), 'utf8'));
    }
    console.log('menj.bio unreachable (' + err.message + ') — continuing without it');
    return null;
  }
}

const bio = await loadBioIdentity();
const bioPerson = bio && Array.isArray(bio['@graph'])
  ? bio['@graph'].find((node) => node['@type'] === 'Person')
  : null;

/* Authority files first: these are what consolidate an entity. */
const AUTHORITY = [/wikidata\.org/, /viaf\.org/, /scholar\.google/, /worldcat\.org/, /isni\.org/, /id\.loc\.gov/];

function mergedSameAs(local) {
  const seen = new Set();
  const norm = (u) => u.replace(/\/$/, '').toLowerCase();
  const out = [];
  const push = (u) => { if (u && !seen.has(norm(u))) { seen.add(norm(u)); out.push(u); } };

  local.forEach(push);
  if (bioPerson && Array.isArray(bioPerson.sameAs)) bioPerson.sameAs.forEach(push);
  return out.sort((a, b) => {
    const rank = (u) => (AUTHORITY.some((re) => re.test(u)) ? 0 : 1);
    return rank(a) - rank(b);
  });
}

function bioIdentifiers() {
  if (!bioPerson || !Array.isArray(bioPerson.sameAs)) return undefined;
  const find = (re) => bioPerson.sameAs.find((u) => re.test(u));
  const out = [];
  const wikidata = find(/wikidata\.org\/wiki\/(Q\d+)/);
  if (wikidata) out.push({ '@type': 'PropertyValue', propertyID: 'Wikidata', value: wikidata.split('/').pop(), url: wikidata });
  const viaf = find(/viaf\.org/);
  if (viaf) out.push({ '@type': 'PropertyValue', propertyID: 'VIAF', value: viaf.split('/').pop(), url: viaf });
  return out.length ? out : undefined;
}

/* ---------- structured data ----------
   One @graph per page rather than a scatter of separate blocks: every node
   carries an @id, so the page, the person, the organisation and each listed
   work reference one another instead of repeating themselves. Everything
   described here is visible on the page, which is the condition for the
   markup being legitimate rather than decorative. */
const BASE = site.meta.canonical.replace(/\/$/, '');
const abs = (path) => (/^https?:/.test(path) ? path : BASE + '/' + String(path).replace(/^\//, ''));

const ID = {
  website: BASE + '/#website',
  webpage: BASE + '/#webpage',
  person: BASE + '/#person',
  publisher: BASE + '/#langgam-fikir',
  books: BASE + '/#books',
  repos: BASE + '/#code',
  press: BASE + '/press.html#collection',
  blog: 'https://menj.blog/#blog',
  archive: 'https://menj.bio/#website'
};

function personNode() {
  const p = site.person;
  return {
    '@type': 'Person',
    '@id': ID.person,
    name: p.name,
    givenName: p.firstName,
    familyName: p.lastName,
    alternateName: p.alternateName,
    url: site.meta.canonical,
    mainEntityOfPage: { '@id': ID.webpage },
    image: { '@type': 'ImageObject', url: abs(p.image), width: 440, height: 440 },
    jobTitle: p.jobTitle,
    description: site.meta.socialDescription,
    /* The employer is deliberately not named. workLocation carries the
       arrangement without identifying the company. */
    workLocation: {
      '@type': 'Place',
      name: 'Remote',
      address: { '@type': 'PostalAddress', addressLocality: p.city, addressCountry: p.country }
    },
    affiliation: { '@id': ID.publisher },
    homeLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: p.city, addressCountry: p.country }
    },
    knowsAbout: p.knowsAbout,
    knowsLanguage: p.knowsLanguage.map((code) => ({ '@type': 'Language', alternateName: code })),
    alumniOf: { '@type': 'CollegeOrUniversity', name: p.alumniOf },
    identifier: bioIdentifiers(),
    subjectOf: { '@id': ID.archive },
    sameAs: mergedSameAs(p.sameAs)
  };
}

function bookNodes() {
  return collections.books.map((book, index) => ({
    '@type': 'Book',
    '@id': `${BASE}/#book-${index + 1}`,
    name: book.title,
    author: { '@id': ID.person },
    datePublished: book.datePublished || book.year,
    inLanguage: book.inLanguage,
    genre: book.genre,
    publisher: book.publisher ? { '@type': 'Organization', name: book.publisher } : undefined,
    isbn: book.isbn,
    url: book.url
  }));
}

function repoNodes() {
  return collections.repos.map((repo, index) => ({
    '@type': 'SoftwareSourceCode',
    '@id': `${BASE}/#repo-${index + 1}`,
    name: repo.name,
    description: stripTags(repo.body),
    codeRepository: repo.url,
    url: repo.url,
    programmingLanguage: repo.programmingLanguage,
    applicationCategory: repo.applicationCategory,
    author: { '@id': ID.person },
    runtimePlatform: 'WordPress'
  }));
}

function stripTags(html) {
  return String(html || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*{1,3}(\S[^*]*?\S|\S)\*{1,3}/g, '$1')
    .replace(/==(\S[^=]*?\S|\S)==/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function siteGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': ID.website,
        url: site.meta.canonical,
        name: site.meta.siteName,
        description: site.meta.description,
        inLanguage: site.meta.lang,
        publisher: { '@id': ID.person },
        copyrightHolder: { '@id': ID.person }
      },
      {
        '@type': 'ProfilePage',
        '@id': ID.webpage,
        url: site.meta.canonical,
        name: site.meta.title,
        description: site.meta.description,
        isPartOf: { '@id': ID.website },
        about: { '@id': ID.person },
        mainEntity: { '@id': ID.person },
        inLanguage: site.meta.lang,
        primaryImageOfPage: { '@type': 'ImageObject', url: abs(site.meta.ogImage), width: 1200, height: 630 },
        hasPart: [{ '@id': ID.books }, { '@id': ID.repos }],
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: site.meta.canonical }
          ]
        }
      },
      personNode(),
      {
        '@type': 'Organization',
        '@id': ID.publisher,
        name: site.person.businessName || 'Langgam Fikir Enterprise',
        description: 'Independent imprint publishing in literature, history, ideas and religious discourse.',
        founder: { '@id': ID.person },
        address: { '@type': 'PostalAddress', addressLocality: 'Seri Kembangan', addressRegion: 'Selangor', addressCountry: 'MY' }
      },
      {
        '@type': ['WebSite', 'ArchiveComponent'],
        '@id': ID.archive,
        url: 'https://menj.bio/',
        name: 'Biography: Mohd Elfie Nieshaem Juferi',
        description: 'Biographical archive: works, qualifications, records, media and sources.',
        about: { '@id': ID.person },
        maintainer: { '@id': ID.person },
        inLanguage: ['en', 'ms']
      },
      {
        '@type': 'Blog',
        '@id': ID.blog,
        url: 'https://menj.blog/',
        name: 'menj.blog',
        author: { '@id': ID.person },
        inLanguage: ['en', 'ms']
      },
      {
        '@type': 'ItemList',
        '@id': ID.books,
        name: content.books.heading,
        description: content.books.intro,
        numberOfItems: collections.books.length,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement: bookNodes().map((node, index) => ({
          '@type': 'ListItem', position: index + 1, item: node
        }))
      },
      {
        '@type': 'ItemList',
        '@id': ID.repos,
        name: content.code.heading,
        numberOfItems: collections.repos.length,
        itemListElement: repoNodes().map((node, index) => ({
          '@type': 'ListItem', position: index + 1, item: node
        }))
      },
      ...collections.services.map((service, index) => ({
        '@type': 'Service',
        '@id': `${BASE}/#service-${index + 1}`,
        name: service.title,
        description: stripTags(service.body),
        provider: { '@id': ID.person },
        areaServed: { '@type': 'Country', name: 'Malaysia' }
      }))
    ]
  };
}

function pressIndexGraph(list) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': ID.press,
        url: BASE + '/press.html',
        name: 'Press releases',
        isPartOf: { '@id': ID.website },
        about: { '@id': ID.person },
        inLanguage: site.meta.lang,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: site.meta.canonical },
            { '@type': 'ListItem', position: 2, name: 'Press', item: BASE + '/press.html' }
          ]
        },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: list.length,
          itemListOrder: 'https://schema.org/ItemListOrderDescending',
          itemListElement: list.map((release, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: release.url,
            name: release.headline
          }))
        }
      }
    ]
  };
}

function releaseGraph(release) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        '@id': release.url + '#article',
        headline: release.headline,
        alternativeHeadline: release.subhead,
        description: release.summary,
        articleSection: 'Press release',
        genre: 'Press release',
        datePublished: release.dateline.date,
        dateModified: release.dateline.date,
        inLanguage: site.meta.lang,
        url: release.url,
        mainEntityOfPage: { '@id': release.url + '#webpage' },
        image: { '@type': 'ImageObject', url: abs(site.meta.ogImage), width: 1200, height: 630 },
        author: { '@id': ID.person },
        creator: { '@id': ID.person },
        publisher: { '@id': ID.publisher },
        copyrightHolder: { '@id': ID.person },
        keywords: release.tags,
        contentLocation: { '@type': 'Place', name: release.dateline.city },
        articleBody: release.body.map(stripTags).join('\n\n'),
        citation: (release.quotes || []).map((quote) => ({
          '@type': 'Quotation',
          text: stripTags(quote.text),
          spokenByCharacter: undefined,
          creator: { '@type': 'Person', name: String(quote.attribution).split(',')[0].trim() }
        }))
      },
      {
        '@type': 'WebPage',
        '@id': release.url + '#webpage',
        url: release.url,
        name: release.headline,
        description: release.summary,
        isPartOf: { '@id': ID.website },
        primaryImageOfPage: { '@type': 'ImageObject', url: abs(site.meta.ogImage) },
        inLanguage: site.meta.lang,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: site.meta.canonical },
            { '@type': 'ListItem', position: 2, name: 'Press', item: BASE + '/press.html' },
            { '@type': 'ListItem', position: 3, name: release.headline, item: release.url }
          ]
        }
      },
      { '@type': 'Organization', '@id': ID.publisher, name: site.person.businessName || 'Langgam Fikir Enterprise', founder: { '@id': ID.person } },
      { '@type': 'Person', '@id': ID.person, name: site.person.name, url: site.meta.canonical, sameAs: site.person.sameAs }
    ]
  };
}

/* Drops undefined and empty values so the output carries no hollow nodes. */
function prune(value) {
  if (Array.isArray(value)) {
    const cleaned = value.map(prune).filter((v) => v !== undefined);
    return cleaned.length ? cleaned : undefined;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = prune(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === '' ) return undefined;
  return value;
}

const json = (value) => JSON.stringify(prune(value), null, 2);

/* ---------- write ---------- */
const template = readFileSync(at('build/index.template.html'), 'utf8');

model.releases = releases;
model.gallery = gallery;
model.flickr = site.flickr || {};
model.instagram = instagram || {};
model.discoveryLinks = [
  ['llms.txt','text/plain','AI Discovery (llms.txt)'],
  ['ai.txt','text/plain','AI Usage Policy (ai.txt)'],
  ['ai.json','application/json','AI Permissions (ai.json)'],
  ['identity.json','application/json','Identity (identity.json)'],
  ['llms.html','text/html','AI Discovery, HTML (llms.html)']
].map(([file, type, title]) => `<link rel="alternate" type="${type}" href="${site.meta.canonical}${file}" title="${title}" />`).join('\n');
model.wordmarkSvg = readFileSync(at('assets/img/logo.svg'), 'utf8').trim();
model.jsonld = json(siteGraph());
model.feedJSON = JSON.stringify(site.feed, null, 2);
model.year = new Date().getFullYear();
model.absoluteOgImage = site.meta.canonical.replace(/\/$/, '') + '/' + site.meta.ogImage;

const html = render(template, { $root: { ...model, base: '' } });
writeFileSync(at('index.html'), html);

/* ---------- 404 page ---------- */
const notFoundTemplate = readFileSync(at('build/404.template.html'), 'utf8');
writeFileSync(at('404.html'), render(notFoundTemplate, { $root: { ...model, base: '' } }));


/* ---------- press pages ---------- */
const pressTemplate = readFileSync(at('build/press.template.html'), 'utf8');
const pressIndexTemplate = readFileSync(at('build/press-index.template.html'), 'utf8');
const pressIndexUrl = site.meta.canonical.replace(/\/$/, '') + '/press.html';

for (const release of releases) release.jsonld = json(releaseGraph(release));

if (releases.length) mkdirSync(at('press'), { recursive: true });
for (const release of releases) {
  const page = render(pressTemplate, {
    $root: { ...model, release, base: '../', absoluteOgImage: model.absoluteOgImage }
  });
  writeFileSync(at('press', `${release.slug}.html`), page);
}

/* HTML site map — the guide asks for one for users, alongside the XML file
   for crawlers. Organised by subject rather than a flat list. Flat file at
   the root, same as every other page, so it ends in .html like the rest. */
const sitemapTemplate = readFileSync(at('build/sitemap.template.html'), 'utf8');
const sitemapPageUrl = BASE + '/sitemap.html';
writeFileSync(
  at('sitemap.html'),
  render(sitemapTemplate, { $root: { ...model, base: '', sitemapUrl: sitemapPageUrl } })
);

writeFileSync(
  at('press.html'),
  render(pressIndexTemplate, { $root: { ...model, base: '', pressIndexUrl, pressJsonld: json(pressIndexGraph(releases)) } })
);

/* sitemap: front page, press archive, every release */
const today = new Date().toISOString().slice(0, 10);
const urls = [
  {
    loc: site.meta.canonical,
    lastmod: today,
    priority: '1.0',
    changefreq: 'monthly',
    images: [
      { loc: abs(site.person.image), title: site.person.name, caption: site.person.imageAlt },
      { loc: abs(site.meta.ogImage), title: site.person.name }
    ]
  },
  { loc: sitemapPageUrl, lastmod: today, priority: '0.3', changefreq: 'monthly' },
  { loc: pressIndexUrl, lastmod: releases.length ? releases[0].dateline.date : today, priority: '0.6', changefreq: 'monthly' },
  ...releases.map((r) => ({ loc: r.url, lastmod: r.dateline.date, priority: '0.5', changefreq: 'yearly' }))
];

writeFileSync(
  at('sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${(u.images || []).map((img) => `
    <image:image>
      <image:loc>${img.loc}</image:loc>
      <image:title>${img.title}</image:title>${img.caption ? `
      <image:caption>${img.caption}</image:caption>` : ''}
    </image:image>`).join('')}
  </url>`).join('\n')}
</urlset>
`
);

/* ---------- AI discovery stack ---------- */
const discoveryFiles = writeDiscoveryFiles({
  root,
  site,
  content,
  collections,
  ai,
  releases,
  bioPerson,
  personGraph: personNode()
});
console.log(`Wrote ${discoveryFiles.length} AI discovery files`);

writeFileSync(
  at('robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${site.meta.canonical}sitemap.xml\n\n` +
  `# AI discovery files\n` +
  discoveryFiles.map(([file, label]) => `# ${label}: ${site.meta.canonical}${file}`).join('\n') + '\n'
);

const counts = Object.entries(collections).map(([k, v]) => `${k} ${v.length}`).join(', ');
console.log(`Wrote ${releases.length} press page(s) + press.html`);
console.log(`Wrote index.html (${html.length.toLocaleString()} bytes) — ${counts}`);
console.log('Wrote sitemap.xml, robots.txt');
