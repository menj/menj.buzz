#!/usr/bin/env bash
# Full build: render the flat-file JSON into static HTML, then compile the CSS
# for whatever classes that HTML ended up using. Order matters.
set -euo pipefail
cd "$(dirname "$0")"
python3 images.py
node render.mjs
npx --no-install tailwindcss \
  -c tailwind.config.js \
  -i tailwind.input.css \
  -o ../assets/css/tailwind.css \
  --minify
echo "Wrote assets/css/tailwind.css"
node cache-bust.mjs
