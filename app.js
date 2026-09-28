// Main: load the public data feed, then run the map, panel and timeline together.
import { loadGoogleMaps, createMap } from './map.js';
import { mountUI, fmtDay } from './ui.js';
import { createScene } from './scene.js';

const CFG = window.SITE_CONFIG || {};
const get = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
const registry = await get('data/layers.json');
const L = await get(registry.layers.find(l => l.status === 'live').src);
const [counties, towns] = await Promise.all([
  registry.region.outline ? get(registry.region.outline).catch(() => null) : null,
  registry.region.towns ? get(registry.region.towns).catch(() => null) : null,
]);

// ——— timeline positions (days since the window start; the time of day adds a fraction)
const [sy, sm, sd] = L.window.start.split('-').map(Number), [ey, em, ed] = L.window.end.split('-').map(Number);
L.days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 864e5) + 1;
const pad = n => String(n).padStart(2, '0');
L.dayLabel = k => { const d = new Date(Date.UTC(sy, sm - 1, sd + k)); return fmtDay(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`); };
const tOf = (date, time) => {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 864e5);
  return day + (time ? (+time.slice(0, 2) * 60 + +time.slice(3, 5)) / 1440 : 0.5);
};
for (const r of [...L.records, ...L.tips]) r.t = tOf(r.date, r.time);
for (const a of L.arrests || []) a.t = tOf(a.booked, null);
L.extents = { reports: { label: 'All reports' }, ...registry.region.extents };
L.townFacts = Object.fromEntries((towns?.features || []).map(f => [f.properties.name, { ...f.properties.facts, source: f.properties.factsSource }]));
L.countyFacts = Object.fromEntries((counties?.features || []).filter(f => f.properties.facts)
  .map(f => [f.properties.NAME.replace(/ County$/, ''), { ...f.properties.facts, source: f.properties.factsSource }]));

const entries = [];
for (const r of [...L.records, ...L.tips]) r.story.forEach((s, i) => {
  const et = s.date ? tOf(s.date, s.date.length > 10 ? s.date.slice(11, 16) : null) : null;
  entries.push({ key: `${r.id}:${i}`, r, s, t: Math.min(L.days, Math.max(r.t ?? 0, et ?? r.t ?? 0)) });
});
entries.sort((a, b) => a.t - b.t);

// ——— state
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const S = { T: reduced ? L.days : 0, playing: !reduced, cats: new Set(L.categories.map(c => c.key)),
            ev: new Set(['agency', 'news', 'call']), tips: false, selected: null, tab: 'live' };
const shows = r => S.cats.has(r.category) && (r.evidence === 'tip' ? S.tips : S.ev.has(r.evidence));
const all = [...L.records, ...L.tips, ...L.updates, ...L.uncertain];
const find = id => all.find(r => r.id === id) || null;
const order = () => [...L.records, ...(S.tips ? L.tips : [])].filter(shows).sort((a, b) => a.t - b.t);

let map = null;
const act = {
  find, refresh, hover: r => map?.hover(r), extent: k => map?.setExtent(k),
  visibleEntries: () => entries.filter(e => e.t <= S.T && shows(e.r)),
  totalEntries: () => entries.filter(e => shows(e.r)).length,
  setT(v) { S.T = Math.max(0, Math.min(L.days, v)); tick(true); },
  pause() { S.playing = false; ui.setPlaying(false); },
  togglePlay() { if (!S.playing && S.T >= L.days) S.T = 0; S.playing = !S.playing; ui.setPlaying(S.playing); },
  select(r, opts = {}) {
    S.selected = r;
    document.body.classList.toggle('focus', !!r);  // first, so the map frames the report beside the wider panel
    if (r) { S.playing = false; ui.setPlaying(false); if (r.t != null && S.T < r.t) S.T = L.days; }
    if (!r && S.touring) stopTour();
    history.replaceState(null, '', r ? `#${r.id}` : location.pathname + location.search);
    map?.select(r && r.lat != null ? r : null);
    ui.showIncident(r, order());
    tick(true);
    if (!scene) return;
    return r ? scene.show(r, opts) : scene.hide();
  },
};
const ui = mountUI(L, S, act);

function refresh() { ui.drawDistribution(order()); tick(true); ui.renderList(true); }
let lastT = -1;
function tick(force = false) {
  if (!force && Math.abs(S.T - lastT) < 1e-3) return;
  lastT = S.T;
  const now = [...L.records, ...(S.tips ? L.tips : [])].filter(r => shows(r) && r.t != null && r.t <= S.T);
  ui.frame(S.T, now.filter(r => r.evidence !== 'tip').length);
  map?.setVisible(new Set(now.filter(r => r.lat != null).map(r => r.id)));
  ui.renderList();
}

// ——— map (the panel works without it)
// the panel's target width (a probe sized by --pw), not its width mid-animation
const probe = Object.assign(document.createElement('div'), { className: 'pwprobe' });
document.body.appendChild(probe);
const panelWidth = () => (innerWidth <= 760 ? 0 : Math.min(probe.offsetWidth, innerWidth - 40));
window.gm_authFailure = () => ui.mapMessage('Google rejected the map key',
  `Check the key allows this address (${location.origin}/*) and the Maps JavaScript API. The list and timeline still work.`);
if (!CFG.mapsApiKey) {
  ui.mapMessage('Map key not set', 'Run "run.py set-maps-key", then reload this page. The list and timeline still work.');
} else {
  try {
    await loadGoogleMaps(CFG.mapsApiKey);
    map = await createMap(document.getElementById('map'), { mapId: CFG.mapId, registry, counties, towns, records: L.records,
      panelWidth, onSelect: r => act.select(S.selected === r ? null : r), onHover: r => ui && map?.hover(r), onTown: t => ui.showTown(t) });
  } catch (e) {
    ui.mapMessage('Map could not load', `${e.message}. The list and timeline still work.`);
  }
}

// ——— dive-in scenes (3D flyover, Street View at businesses, satellite) and the guided 3D tour
const scene = map ? createScene({ map2d: map, reduced }) : null;
let tourBar = null;
function stopTour() { S.touring = false; tourBar?.remove(); tourBar = null; }
async function tour() {
  const stops = L.records.filter(r => r.lat != null && r.evidence !== 'call').sort((a, b) => a.t - b.t);
  if (!stops.length || !scene) return;
  S.touring = true; S.T = L.days;
  tourBar = document.createElement('div'); tourBar.className = 'tourbar';
  tourBar.innerHTML = '<span class="tk">3D tour · confirmed reports</span><span class="tn"></span><button type="button">Stop tour</button>';
  tourBar.querySelector('button').onclick = () => act.select(null);
  document.body.appendChild(tourBar);
  for (let i = 0; i < stops.length && S.touring; i++) {
    tourBar.querySelector('.tn').textContent = `${i + 1} of ${stops.length}`;
    await act.select(stops[i], { force: '3d', orbitMs: 15000 });
  }
  if (S.touring) { stopTour(); act.select(null); }
}
if (scene && !reduced) {
  const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'tourbtn'; tb.textContent = '3D tour';
  tb.title = 'Fly through the confirmed reports in 3D'; tb.onclick = tour;
  document.querySelector('.tools')?.appendChild(tb);
}

// ——— start
window.__site = { S, L, get map() { return map; } };  // for debugging in the browser console
refresh();
const fromHash = location.hash.length > 1 && find(decodeURIComponent(location.hash.slice(1)));
if (fromHash) { S.T = L.days; S.playing = false; act.select(fromHash); }
ui.setPlaying(S.playing);
addEventListener('keydown', e => { if (e.key === 'Escape' && (S.selected || S.touring)) act.select(null); });
let prev = performance.now();
const loop = now => {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  if (S.playing) { S.T += dt * (L.days / 12); if (S.T >= L.days) { S.T = L.days; S.playing = false; ui.setPlaying(false); } tick(); }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
