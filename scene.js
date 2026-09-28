// Dive-in views for a selected report. The paper map is the overview; opening a report goes to Satellite
// (street names on, pins kept), and the switcher offers only the richer views that exist for that place:
//   3D flyover  — Google photorealistic 3D with a slow drone orbit. A translucent drum marks the reported area,
//                 sized by how precise the location is (a block, a crossing, a street); long rural roads are
//                 highlighted instead. Nothing points at a particular home.
//   Street view — only at businesses (never homes, schools, apartments, churches, jails or hospitals).
// One 3D element and one panorama are created on first use and reused, so a visit loads each at most once.
import { CAT_COLORS, ringPath, corridorPath, boxPath } from './map.js';

const MON = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

function circle(lat, lng, m, alt, n = 40) {
  const out = [], dLat = m / 111320, dLng = m / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    out.push({ lat: lat + dLat * Math.sin(a), lng: lng + dLng * Math.cos(a), altitude: alt });
  }
  return out;
}

// camera framing by situation: the reported area fills the view; closer at businesses, wider where officers
// were involved, and a slower, quieter orbit where someone died
function plan(r, ring) {
  const p = { range: Math.max(380, Math.min(9000, ring * 3.4)), tilt: 58, orbitMs: 36000, heading: ((r.n || 1) * 47) % 360 };
  if (r.publicPlace) Object.assign(p, { range: Math.max(260, ring * 3), tilt: 55 });
  if (r.officerInvolved) p.range *= 1.25;
  if (r.fatal) p.orbitMs = 50000;
  if (r.roadPath?.length) Object.assign(p, { tilt: 45, orbitMs: 44000 });
  return p;
}

export function createScene({ map2d, reduced, onMode }) {
  const root = document.createElement('section');
  root.className = 'scene'; root.hidden = true; root.setAttribute('aria-label', 'Detailed view');
  root.innerHTML = `<div class="scene-3d"></div><div class="scene-sv"></div>
    <figure class="scene-cap"><p class="k"></p><p class="t"></p><p class="c">Imagery © Google</p></figure>`;
  document.body.appendChild(root);
  const host3d = root.querySelector('.scene-3d'), hostSv = root.querySelector('.scene-sv');
  const cap = { k: root.querySelector('.k'), t: root.querySelector('.t') };

  const bar = document.createElement('div');
  bar.className = 'modes'; bar.hidden = true; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'View');
  bar.innerHTML = `<button type="button" data-m="satellite">Satellite</button><button type="button" data-m="3d">3D flyover</button>
    <button type="button" data-m="street">Street view</button><button type="button" class="spin" title="Replay">↻</button>`;
  document.body.appendChild(bar);

  let lib3 = null, m3 = null, drum = null, road = null, dim = null, mark = null, three = 'untried';
  let pano = null, svService = null, geo = null;
  const svCache = new Map(), placeCache = new Map();
  let cur = null, mode = 'paper', token = 0, pref = null, svTimer = 0;

  async function has3d() {  // loading the library is free; the 3D map itself is created only when asked for
    if (three === 'untried') {
      try { lib3 = await google.maps.importLibrary('maps3d'); three = 'lib'; } catch (e) { console.warn('3D unavailable:', e); three = 'failed'; }
    }
    return three !== 'failed';
  }

  async function ensure3d() {
    if (three === 'ok') return true;
    if (!(await has3d())) return false;
    try {
      const { PinElement } = await google.maps.importLibrary('marker');
      m3 = new lib3.Map3DElement({ center: { lat: 34.19, lng: -79.77, altitude: 0 }, range: 3000, tilt: 50, heading: 0,
                                   mode: lib3.MapMode?.SATELLITE ?? 'SATELLITE', defaultUIHidden: true, gestureHandling: 'GREEDY' });
      host3d.appendChild(m3);
      drum = new lib3.Polygon3DElement({ altitudeMode: 'RELATIVE_TO_GROUND', extruded: true, fillColor: 'rgba(200,16,46,0.14)',
                                         strokeColor: 'rgba(200,16,46,0.5)', strokeWidth: 1.2, drawsOccludedSegments: true });
      road = new lib3.Polyline3DElement({ altitudeMode: 'CLAMP_TO_GROUND', strokeColor: '#c8102e', strokeWidth: 8,
                                          outerColor: '#f3f0e8', outerWidth: 0.6, drawsOccludedSegments: true });
      // a ground sheet with the reported area cut out: everything around it reads a little darker
      dim = new lib3.Polygon3DElement({ altitudeMode: 'CLAMP_TO_GROUND', fillColor: 'rgba(5,5,5,0.5)', strokeColor: 'rgba(0,0,0,0)',
                                        strokeWidth: 0, drawsOccludedSegments: true });
      mark = new lib3.Marker3DElement({ altitudeMode: 'CLAMP_TO_GROUND', extruded: false, drawsWhenOccluded: true, sizePreserved: true });
      mark._pin = new PinElement({ background: '#c8102e', borderColor: '#111111', glyphColor: '#f3f0e8', scale: 1.1 });
      mark.append(mark._pin);
      host3d.addEventListener('pointerdown', () => m3.stopCameraAnimation?.());  // the viewer takes the controls
      three = 'ok';
      return true;
    } catch (e) {
      console.warn('3D unavailable:', e);
      three = 'failed';
      return false;
    }
  }

  // businesses only: find the storefront at view time so Street View faces the right building.
  // Places results are shown, never stored (Google terms); homes never reach this code.
  async function storefront(r) {
    if (!r.publicPlace || !r.placeName || r.lat == null) return null;
    if (placeCache.has(r.id)) return placeCache.get(r.id);
    let hit = null;
    try {
      geo ||= await google.maps.importLibrary('geometry');
      const { Place } = await google.maps.importLibrary('places');
      const street = r.place.replace(/^\d+ block of /, '').replace(/\s*\(.*\)$/, '');
      const { places } = await Place.searchByText({ textQuery: `${r.placeName}, ${street}, SC`, fields: ['location'],
        maxResultCount: 1, locationBias: { center: { lat: r.lat, lng: r.lon }, radius: 1500 } });
      const loc = places?.[0]?.location;
      if (loc && geo.spherical.computeDistanceBetween(loc, new google.maps.LatLng(r.lat, r.lon)) < 1500) hit = loc;
    } catch (e) { console.warn('storefront lookup failed:', e); }
    placeCache.set(r.id, hit);
    return hit;
  }

  async function streetFor(r) {
    if (!r.publicPlace || r.lat == null) return null;
    if (svCache.has(r.id)) return svCache.get(r.id);
    svService ||= new google.maps.StreetViewService();
    geo ||= await google.maps.importLibrary('geometry');
    const front = await storefront(r), target = front || new google.maps.LatLng(r.lat, r.lon);
    let found = null;
    try {
      const res = await svService.getPanorama({ location: target, radius: front ? 60 : 80, source: google.maps.StreetViewSource.OUTDOOR });
      const loc = res?.data?.location;
      if (loc?.pano) found = { pano: loc.pano, heading: geo.spherical.computeHeading(loc.latLng, target), date: res.data.imageDate || null, front: !!front };
    } catch { /* no panorama nearby */ }
    svCache.set(r.id, found);
    return found;
  }

  function caption(r, m, extra = {}) {
    const where = r.placeName && r.publicPlace ? `${r.placeName}, ${r.place.replace(/\s*\(.*\)$/, '')}` : r.place;
    if (m === '3d') {
      cap.k.textContent = 'Aerial view · 3D';
      cap.t.textContent = r.roadPath?.length ? `${where}. The report names the road, not the block, so the whole stretch is marked.`
        : r.publicPlace ? `Around ${where}. The marker shows the reported location.`
        : `The area around ${where}. The red drum marks the reported area, about ${Math.round((r.ringM || 90) * 2)} m across; it does not point to any home.`;
    } else if (m === 'street') {
      cap.k.textContent = 'Street View';
      cap.t.textContent = `${extra.front ? 'Facing' : 'Near'} ${where}, the business named in reports.${extra.date || ''}`;
    }
  }

  function fly3d(r, orbitMs) {
    // a business already placed on its county address point keeps that point; otherwise the storefront Google finds
    const t = ++token, front = r.placedBy === 'county-address-business' ? null : placeCache.get(r.id);
    const c = front ? { lat: front.lat(), lng: front.lng() } : { lat: r.lat, lng: r.lon };
    const ring = front ? 45 : (r.ringM || 90), p = plan(r, Math.max(ring, 45));
    const cam = { center: { ...c, altitude: 0 }, range: p.range, tilt: p.tilt, heading: p.heading };
    drum.remove(); road.remove(); mark.remove(); dim.remove();
    dim.outerCoordinates = boxPath(c.lat, c.lng, Math.min(60000, Math.max(2500, p.range * 6)));
    dim.innerCoordinates = [r.roadPath?.length ? corridorPath(r.roadPath, 120) : ringPath(c.lat, c.lng, ring)];
    m3.append(dim);
    if (r.roadPath?.length) {
      road.path = r.roadPath.map(([lat, lng]) => ({ lat, lng }));
      m3.append(road);
    } else {
      drum.path = circle(c.lat, c.lng, ring, ring > 300 ? 40 : 24);
      m3.append(drum);
    }
    if (r.publicPlace) {  // businesses get a pin standing on the ground at the same centre; homes never do
      mark.position = { ...c, altitude: 0 };
      mark._pin.background = CAT_COLORS[r.category] || '#c8102e';
      m3.append(mark);
    }
    m3.stopCameraAnimation?.();
    if (reduced) { Object.assign(m3, { center: cam.center, range: cam.range, tilt: cam.tilt, heading: cam.heading }); return Promise.resolve(); }
    // animation-end events can arrive late from a stopped flight, so ignore early ones and keep a timeout backstop
    const waitEnd = minMs => new Promise(res => {
      const t0 = performance.now();
      const done = () => { m3.removeEventListener('gmp-animationend', h); clearTimeout(to); res(); };
      const h = () => { if (performance.now() - t0 >= minMs) done(); };
      const to = setTimeout(done, minMs + 4000);
      m3.addEventListener('gmp-animationend', h);
    });
    const ms = orbitMs ?? p.orbitMs;
    return (async () => {
      await new Promise(res => setTimeout(res, 80));
      if (t !== token) return;
      m3.flyCameraTo({ endCamera: cam, durationMillis: 2800 });
      await waitEnd(2200);
      if (t !== token) return;
      m3.flyCameraAround({ camera: cam, durationMillis: ms, repeatCount: 1 });
      await waitEnd(ms * 0.85);
    })();
  }

  function spinStreet(heading) {  // slow look-around that settles facing the reported location
    clearInterval(svTimer);
    if (reduced) { pano.setPov({ heading, pitch: 3 }); return; }
    const start = performance.now(), from = heading - 200, dur = 16000;
    svTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / dur), e = 1 - Math.pow(1 - k, 3);
      pano.setPov({ heading: from + 200 * e, pitch: 3 });
      if (k >= 1) clearInterval(svTimer);
    }, 33);
  }
  hostSv.addEventListener('pointerdown', () => clearInterval(svTimer));

  function paint() {
    for (const b of bar.querySelectorAll('[data-m]')) b.setAttribute('aria-pressed', b.dataset.m === mode);
    bar.querySelector('.spin').hidden = !(mode === '3d' || mode === 'street');
    root.hidden = !(mode === '3d' || mode === 'street');
    host3d.hidden = mode !== '3d'; hostSv.hidden = mode !== 'street';
    document.body.dataset.scene = mode;
    onMode?.(mode);
  }

  async function setMode(m, { orbitMs, user = false } = {}) {
    if (!cur || cur.lat == null) return;
    if (user) pref = m === 'satellite' ? null : m;
    clearInterval(svTimer);
    if (m === '3d' && !(await ensure3d())) m = 'satellite';
    if (m === 'street') {
      const sv = await streetFor(cur);
      if (!sv) m = 'satellite';
      else {
        pano ||= new google.maps.StreetViewPanorama(hostSv, { addressControl: false, linksControl: false, panControl: false,
          zoomControl: false, fullscreenControl: false, motionTracking: false, motionTrackingControl: false, showRoadLabels: false,
          enableCloseButton: false, clickToGo: false, disableDefaultUI: true });
        pano.setPano(sv.pano); pano.setZoom(0.6); pano.setVisible(true);
        const d = sv.date ? ` Street View image from ${MON[+sv.date.slice(5, 7) - 1] || ''} ${sv.date.slice(0, 4)}; it may predate the incident.` : '';
        mode = m; caption(cur, m, { date: d, front: sv.front }); paint(); spinStreet(sv.heading);
        return;
      }
    }
    const was = mode;
    mode = m;
    if (m === '3d') { caption(cur, m); paint(); return fly3d(cur, orbitMs); }
    map2d?.setBase('satellite');
    paint();
    if (was === '3d' || was === 'street') map2d?.focus?.(cur);
  }

  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.hidden) return;
    if (b.classList.contains('spin')) return setMode(mode, {});
    setMode(b.dataset.m, { user: true });
  });

  return {
    // called when a report is opened: Satellite first; 3D / Street View appear only where they exist
    async show(r, { orbitMs, force } = {}) {
      cur = r; token++;
      if (!r || r.lat == null) { bar.hidden = true; mode = 'paper'; paint(); map2d?.setBase('paper'); return; }
      const [d3, sv] = await Promise.all([has3d(), r.publicPlace ? streetFor(r) : null]);
      if (cur !== r) return;
      bar.querySelector('[data-m="3d"]').hidden = !d3;
      bar.querySelector('[data-m="street"]').hidden = !sv;
      bar.hidden = !d3 && !sv;  // Satellite alone needs no switcher
      const want = force || (pref === 'street' && !sv ? null : pref) || 'satellite';
      return setMode(want, { orbitMs });
    },
    hide() { cur = null; token++; clearInterval(svTimer); m3?.stopCameraAnimation?.(); mode = 'paper'; bar.hidden = true; paint(); map2d?.setBase('paper'); },
    get mode() { return mode; },
  };
}
