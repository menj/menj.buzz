#!/usr/bin/env node
/* =========================================================================
   secrets.mjs — encrypt/decrypt JSON secrets with crypto-js

   Turns any JSON file into a self-contained encrypted envelope, safe to
   commit: AES-256-CBC with a random salt and IV per encryption, and the key
   derived from a passphrase with PBKDF2 (100,000 rounds, SHA-256) rather
   than crypto-js's legacy passphrase mode, which uses a single round of
   MD5. The passphrase itself is never written to disk — it comes from the
   SECRETS_KEY environment variable, the same pattern IG_ACCESS_TOKEN
   already uses for the token itself.

   Used two ways:
     1. Programmatically — encryptJSON()/decryptJSON() — by build/instagram.mjs,
        to keep the refreshed token encrypted at rest between builds.
     2. As a CLI, for the one-time migration and for manual inspection:

          SECRETS_KEY=xxxxx node build/secrets.mjs encrypt data/secrets.instagram.json
          SECRETS_KEY=xxxxx node build/secrets.mjs decrypt data/secrets.instagram.json.enc

     Encrypt writes <file>.enc alongside the input and leaves the input
     untouched — delete the plaintext yourself once you've checked the
     output. Decrypt prints the plaintext JSON to stdout by default, or
     writes it to a path given as a third argument.
   ========================================================================= */

import CryptoJS from 'crypto-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const VERSION = 1;
const ITERATIONS = 100000;
const KEY_SIZE_WORDS = 256 / 32;
const SALT_BYTES = 128 / 8;
const IV_BYTES = 128 / 8;

/** Encrypts a JSON-serialisable value into a self-describing envelope
 *  string (JSON text, safe to write straight to a file). */
export function encryptJSON(data, passphrase) {
  if (!passphrase) throw new Error('missing passphrase (set SECRETS_KEY)');

  const salt = CryptoJS.lib.WordArray.random(SALT_BYTES);
  const iv = CryptoJS.lib.WordArray.random(IV_BYTES);
  const key = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: KEY_SIZE_WORDS,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA256
  });

  const plaintext = CryptoJS.enc.Utf8.parse(JSON.stringify(data));
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  const envelope = {
    v: VERSION,
    kdf: 'pbkdf2-sha256',
    iterations: ITERATIONS,
    salt: salt.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64)
  };
  return JSON.stringify(envelope, null, 2) + '\n';
}

/** Reverses encryptJSON(): takes the envelope text and the passphrase,
 *  returns the original parsed value. Throws on a wrong passphrase, a
 *  corrupted envelope, or an envelope version this build doesn't know. */
export function decryptJSON(envelopeText, passphrase) {
  if (!passphrase) throw new Error('missing passphrase (set SECRETS_KEY)');

  const envelope = JSON.parse(envelopeText);
  if (envelope.v !== VERSION) {
    throw new Error(`unsupported envelope version ${envelope.v}`);
  }

  const salt = CryptoJS.enc.Base64.parse(envelope.salt);
  const iv = CryptoJS.enc.Base64.parse(envelope.iv);
  const ciphertext = CryptoJS.enc.Base64.parse(envelope.ciphertext);
  const key = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: KEY_SIZE_WORDS,
    iterations: envelope.iterations,
    hasher: CryptoJS.algo.SHA256
  });

  const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  const text = decrypted.toString(CryptoJS.enc.Utf8);
  if (!text) throw new Error('decryption failed — wrong SECRETS_KEY or a corrupted file');
  return JSON.parse(text);
}

/* ---------- CLI ---------- */
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [, , cmd, inPath, outPath] = process.argv;
  const passphrase = process.env.SECRETS_KEY;

  const fail = (msg) => { console.error('secrets: ' + msg); process.exit(1); };

  if (!cmd || !inPath || !['encrypt', 'decrypt'].includes(cmd)) {
    fail('usage: node build/secrets.mjs <encrypt|decrypt> <file> [out-file]');
  } else if (!existsSync(inPath)) {
    fail(`no such file: ${inPath}`);
  } else {
    try {
      if (cmd === 'encrypt') {
        const data = JSON.parse(readFileSync(inPath, 'utf8'));
        const envelope = encryptJSON(data, passphrase);
        const dest = outPath || `${inPath}.enc`;
        writeFileSync(dest, envelope);
        console.log(`Wrote ${dest}`);
      } else {
        const data = decryptJSON(readFileSync(inPath, 'utf8'), passphrase);
        const text = JSON.stringify(data, null, 2) + '\n';
        if (outPath) {
          writeFileSync(outPath, text);
          console.log(`Wrote ${outPath}`);
        } else {
          process.stdout.write(text);
        }
      }
    } catch (err) {
      fail(err.message);
    }
  }
}
