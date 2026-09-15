#!/usr/bin/env node
/* =========================================================================
   gallery.mjs — photo rows

   Flickr:    fetched from the public feed at build time and cached. No API
              key is involved; the feed is keyed on the NSID, not the alias.
   Instagram: read from data/instagram.json. Meta shut down the personal
              account API in December 2024 and oEmbed stopped returning
              thumbnails in November 2025, so there is no automatic path
              from a static build. Entries name a local image.

   Both write into data/gallery.json, which render.mjs reads. Images are
   downloaded into assets/img/ once and reused; build/images.py derives
   the AVIF and WebP copies afterwards.
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchInstagram } from './instagram.mjs';

const FEED = 'https://www.flickr.com/services/feeds/photos_public.gne';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'photo';

async function download(url, dest) {
  if (existsSync(dest)) return true;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch (err) {
    console.log('  could not fetch ' + url + ' (' + err.message + ')');
    return false;
  }
}

export async function buildGallery({ root, flickr, instagram }) {
  const at = (p) => resolve(root, p);
  const dir = at('assets/img');
  mkdirSync(dir, { recursive: true });

  const out = { flickr: [], instagram: [] };

  /* ---------- Flickr ---------- */
  if (flickr && flickr.enabled && flickr.nsid) {
    const params = new URLSearchParams({ id: flickr.nsid, format: 'json', nojsoncallback: '1' });
    if (flickr.tags) params.set('tags', flickr.tags);

    let items = null;
    try {
      const res = await fetch(FEED + '?' + params, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      items = (await res.json()).items || [];
      writeFileSync(at('data/cache-flickr.json'), JSON.stringify(items, null, 2));
      console.log('Fetched ' + items.length + ' photos from Flickr');
    } catch (err) {
      if (existsSync(at('data/cache-flickr.json'))) {
        items = JSON.parse(readFileSync(at('data/cache-flickr.json'), 'utf8'));
        console.log('Flickr unreachable (' + err.message + ') — using cache');
      } else {
        console.log('Flickr unreachable (' + err.message + ') — row omitted');
        items = [];
      }
    }

    for (const item of items.slice(0, flickr.count || 8)) {
      /* _m is 240px on the long edge; _c is 800px. Take _c and let the
         browser scale, so the row stays sharp on dense screens. */
      const src = item.media.m.replace(/_m\.jpg$/, '_c.jpg');
      const name = slug(item.title || 'flickr') + '-' + src.split('/').pop().split('_')[1] + '.jpg';
      const ok = await download(src, resolve(dir, name));
      if (!ok) continue;
      out.flickr.push({
        image: 'assets/img/' + name,
        imageAvif: 'assets/img/' + name.replace(/\.jpg$/, '.avif'),
        imageWebp: 'assets/img/' + name.replace(/\.jpg$/, '.webp'),
        url: item.link,
        source: 'Flickr',
        caption: (item.title || '').trim() || 'Photograph',
        date: (item.date_taken || '').slice(0, 10)
      });
    }
  }

  /* ---------- Instagram ----------
     Automatic when a token is present; the manual manifest is the fallback. */
  if (instagram && instagram.enabled) {
    const fetched = await fetchInstagram({ root, config: instagram });
    const posts = fetched && fetched.length
      ? fetched
      : (instagram.posts || []).filter((p) => p && p.image && !p._example);
    if (!fetched) console.log('  instagram: no token, using the manifest');
    for (const post of posts.slice(0, instagram.count || 8)) {
      if (!existsSync(at(post.image))) {
        console.log('  instagram: missing ' + post.image + ' — entry skipped');
        continue;
      }
      out.instagram.push({
        image: post.image,
        imageAvif: post.image.replace(/\.(jpe?g|png)$/i, '.avif'),
        imageWebp: post.image.replace(/\.(jpe?g|png)$/i, '.webp'),
        url: post.url || instagram.profileUrl,
        source: 'Instagram',
        caption: post.caption || 'Photograph',
        date: post.date || ''
      });
    }
    if (posts.length && !out.instagram.length) {
      console.log('  instagram: no usable entries');
    }
  }

  /* One unified grid: Instagram fills the first row, Flickr the second, with
     no platform styling between them. If either source is short, the other
     backfills so the grid never renders a ragged half-row. */
  const perRow = 4;
  const ig = out.instagram.slice(0, perRow);
  const fl = out.flickr.slice(0, perRow);
  const shortfall = (perRow - ig.length) + (perRow - fl.length);
  const spare = shortfall > 0
    ? [...out.instagram.slice(ig.length), ...out.flickr.slice(fl.length)].slice(0, shortfall)
    : [];

  out.tiles = [...ig, ...fl, ...spare].slice(0, perRow * 2);

  writeFileSync(at('data/gallery.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('Gallery: ' + out.tiles.length + ' tiles (' + out.instagram.length + ' Instagram, ' + out.flickr.length + ' Flickr)');
  return out;
}
