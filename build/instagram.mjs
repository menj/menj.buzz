#!/usr/bin/env node
/* =========================================================================
   instagram.mjs — automated Instagram pull

   Uses the Instagram API with Instagram Login (Professional accounts only,
   which yours is). The awkward part of that API is the token: Meta issues a
   long-lived token valid for about 60 days, and it has to be refreshed before
   it expires.

   No server is needed for that. The build refreshes it. Every run calls the
   refresh endpoint, which issues a fresh 60-day token, and writes it back to
   the secrets file. Building at any point inside the window rolls the clock
   forward indefinitely. Only a two-month gap between builds breaks it, and
   the fix is pasting one new token.

   The token lives in data/secrets.instagram.json.enc (encrypted, safe to
   commit — see build/secrets.mjs), in data/secrets.instagram.json
   (plaintext, gitignored) if you haven't migrated to the encrypted form, or
   in the IG_ACCESS_TOKEN environment variable if you would rather not keep
   it on disk at all. Media and images are cached, so a failed call keeps
   the previous row. With no token at all, the build silently falls back to
   the manual manifest in data/instagram.json.
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { encryptJSON, decryptJSON } from './secrets.mjs';

const GRAPH = 'https://graph.instagram.com';
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
const SECRETS = 'data/secrets.instagram.json';
const SECRETS_ENC = 'data/secrets.instagram.json.enc';
const CACHE = 'data/cache-instagram.json';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'post';
const days = (ms) => Math.round(ms / 86400000);

function readToken(at) {
  if (process.env.IG_ACCESS_TOKEN) {
    return { token: process.env.IG_ACCESS_TOKEN, source: 'env' };
  }
  if (existsSync(at(SECRETS_ENC)) && process.env.SECRETS_KEY) {
    try {
      const box = decryptJSON(readFileSync(at(SECRETS_ENC), 'utf8'), process.env.SECRETS_KEY);
      if (box.access_token) return { token: box.access_token, refreshed: box.refreshed_at, source: 'enc' };
    } catch (err) {
      console.log(`  could not decrypt ${SECRETS_ENC} (${err.message})`);
    }
  }
  if (existsSync(at(SECRETS))) {
    const box = JSON.parse(readFileSync(at(SECRETS), 'utf8'));
    if (box.access_token) return { token: box.access_token, refreshed: box.refreshed_at, source: 'file' };
  }
  return null;
}

/* Meta's refresh endpoint returns a new 60-day token. It only works on a
   token that is at least 24 hours old and not yet expired. */
async function refresh(at, token, source) {
  try {
    const url = `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error(data.error?.message || 'HTTP ' + res.status);

    if (source === 'enc' || source === 'file') {
      const box = {
        access_token: data.access_token,
        expires_in_days: days(data.expires_in * 1000),
        refreshed_at: new Date().toISOString(),
        _note: 'Written by build/instagram.mjs on every build. Never commit the plaintext form.'
      };
      if (source === 'enc') {
        writeFileSync(at(SECRETS_ENC), encryptJSON(box, process.env.SECRETS_KEY));
      } else {
        writeFileSync(at(SECRETS), JSON.stringify(box, null, 2) + '\n');
      }
    }
    console.log('  token refreshed, valid another ' + days(data.expires_in * 1000) + ' days');
    return data.access_token;
  } catch (err) {
    console.log('  token refresh failed (' + err.message + ') — using existing token');
    return token;
  }
}

export async function fetchInstagram({ root, config }) {
  const at = (p) => resolve(root, p);
  if (!config || !config.enabled) return null;

  const held = readToken(at);
  if (!held) return null;                   /* caller falls back to the manifest */

  const token = await refresh(at, held.token, held.source);

  let media = null;
  try {
    const url = `${GRAPH}/me/media?fields=${FIELDS}&limit=${(config.count || 8) * 2}&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || 'HTTP ' + res.status);
    media = data.data || [];
    mkdirSync(at('data'), { recursive: true });
    writeFileSync(at(CACHE), JSON.stringify(media, null, 2));
    console.log('Fetched ' + media.length + ' posts from Instagram');
  } catch (err) {
    if (existsSync(at(CACHE))) {
      media = JSON.parse(readFileSync(at(CACHE), 'utf8'));
      console.log('Instagram unreachable (' + err.message + ') — using cache');
    } else {
      console.log('Instagram unreachable (' + err.message + ') — falling back to manifest');
      return null;
    }
  }

  /* Videos and reels expose a still at thumbnail_url; carousels report the
     first child at media_url. Either way one square image is what we want. */
  const dir = at('assets/img');
  mkdirSync(dir, { recursive: true });
  const posts = [];

  for (const item of media) {
    if (posts.length >= (config.count || 8)) break;
    const src = item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url;
    if (!src) continue;

    const caption = (item.caption || '').split('\n')[0].replace(/#\w+/g, '').trim().slice(0, 90) || 'Photograph';
    const name = slug(caption) + '-' + item.id.slice(-8) + '.jpg';
    const dest = resolve(dir, name);

    if (!existsSync(dest)) {
      try {
        const res = await fetch(src, { signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        console.log('  could not download ' + name + ' (' + err.message + ')');
        continue;
      }
    }

    posts.push({
      image: 'assets/img/' + name,
      url: item.permalink,
      caption,
      date: (item.timestamp || '').slice(0, 10)
    });
  }

  return posts;
}
