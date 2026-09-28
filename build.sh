#!/bin/sh
# DigitalOcean App Platform build: copy the site into public/ and write config.js from the app's settings.
# The Google Maps key is an encrypted app secret; it is never stored in this repository.
set -e
rm -rf public && mkdir -p public
cp -R index.html app.js map.js ui.js scene.js app.css styles.css atlas.css data public/
printf 'window.SITE_CONFIG = {"mapsApiKey": "%s", "mapId": "%s"};\n' "${MAPS_API_KEY:-}" "${MAP_ID:-}" > public/config.js
