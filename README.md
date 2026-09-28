# Florence & Darlington violence reports (public site)

Static site built from the incident database's public export (`incident-db/`, `run.py export`).
Deployed on DigitalOcean App Platform; `build.sh` writes `config.js` from the app's encrypted
settings (`MAPS_API_KEY`, `MAP_ID`). No keys, names or house addresses are stored here.
