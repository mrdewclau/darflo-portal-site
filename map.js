// Google Maps layer: styled base map, county/town outlines, needle pins, clusters, camera moves.
// The base map is styled in code (quiet broadsheet look: no icons, shields or neighborhood labels;
// street names only when zoomed in). Pins are HTML drawn by one OverlayView so they stay crisp.
// The API key arrives at page load (config.js, served by the host), never from this code.

export const CAT_COLORS = {
  shooting: '#c8102e', trauma: '#8a4b52', stabbing: '#1d3f73', assault: '#3d6b50',
  robbery: '#9a6a00', threat: '#6b4f8a', death: '#111111', other: '#6a655b',
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PAPER = '#f3f0e8';
const BASE = [
  { elementType: 'geometry', stylers: [{ color: PAPER }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8d877b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: PAPER }, { weight: 4 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.province', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#6a655b' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#ebe6da' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dcdfdc' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dcd6c8' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e7e2d6' }] },
];
// zoomed out: no Google text at all (crossroads, communities, lakes, roads); the map draws its own town and
// county names, so only the places we report on are named
const STYLE_FAR = [...BASE,
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', stylers: [{ visibility: 'off' }] }];
const STYLE_NEAR = [...BASE,
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6a655b' }] }];
// satellite with street names only (labels layer of the hybrid map)
const STYLE_SAT = [
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
];

export function loadGoogleMaps(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.__gmReady = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__gmReady`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps could not load'));
    document.head.append(s);
  });
}

// ——— focus masks: dim everything outside the reported area a little. Outer rings run clockwise, holes the other
// way (Google fills a polygon's holes only when they wind opposite to the outer ring).
const WORLD = [{ lat: 85, lng: -179.9 }, { lat: 85, lng: 0 }, { lat: 85, lng: 179.9 }, { lat: -85, lng: 179.9 }, { lat: -85, lng: 0 }, { lat: -85, lng: -179.9 }];
const mPerLng = lat => 111320 * Math.cos((lat * Math.PI) / 180);
export function ringPath(lat, lng, m, n = 72) {  // counter-clockwise circle
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return { lat: lat + (m / 111320) * Math.sin(a), lng: lng + (m / mPerLng(lat)) * Math.cos(a) }; });
}
export function corridorPath(path, m) {  // counter-clockwise convex hull around a road, m metres to each side
  const pts = [];
  for (const [lat, lng] of path) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI; pts.push([lng + (m / mPerLng(lat)) * Math.cos(a), lat + (m / 111320) * Math.sin(a)]);
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of [...pts].reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)].map(([x, y]) => ({ lat: y, lng: x }));
}
export function boxPath(lat, lng, m) {  // clockwise square, m metres from the centre to each side
  const dLat = m / 111320, dLng = m / mPerLng(lat);
  return [{ lat: lat + dLat, lng: lng - dLng }, { lat: lat + dLat, lng: lng + dLng }, { lat: lat - dLat, lng: lng + dLng }, { lat: lat - dLat, lng: lng - dLng }];
}

const km = (a, b) => {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export async function createMap(host, { registry, counties, towns, records, onSelect, onHover, onTown, panelWidth }) {
  const { Map, OverlayView } = await google.maps.importLibrary('maps');
  const ex = registry.region.extents || {};
  // keep panning near the two counties (set at creation; setting it later re-centres the map). The box is padded
  // well past the counties: when the screen is bigger than the box, Google forces the box to the screen's centre,
  // which on phones hid the counties behind the bottom sheet. Outside the counties the paper mask shows anyway.
  const cb = ex.counties;
  const restriction = cb ? { latLngBounds: { north: cb.n + 1.2, south: cb.s - 1.8, east: cb.e + 1.6, west: cb.w - 1.6 }, strictBounds: false } : undefined;
  const map = new Map(host, {
    center: { lat: 34.15, lng: -79.85 }, zoom: 10, mapTypeId: 'roadmap', styles: STYLE_FAR, backgroundColor: PAPER, restriction,
    disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', keyboardShortcuts: true, isFractionalZoomEnabled: true,
    zoomControl: true, zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER }, minZoom: 8, maxZoom: 18,
  });
  // phone: the panel is a bottom sheet (46% of the height) under the timeline; with a report open the sheet is 58%
  // and the timeline is hidden
  const phone = () => innerWidth <= 760;
  const pad = () => (phone() ? { left: 24, right: 24, top: 64, bottom: document.body.classList.contains('focus') ? Math.round(innerHeight * 0.58) + 24 : Math.round(innerHeight * 0.46) + 112 }
                             : { left: panelWidth() + 48, right: 56, top: 84, bottom: 128 });
  const padSel = () => { const p = pad(); return { ...p, top: Math.max(p.top, 90), bottom: Math.max(p.bottom, 150) }; };
  const bounds = e => new google.maps.LatLngBounds({ lat: e.s, lng: e.w }, { lat: e.n, lng: e.e });
  // lift the pan limit for the move (Google sets the centre first and the limit would clamp it), and stop at zoom 17:
  // closer than that the satellite photos run out and the view goes blank
  const fit = (b, padding) => {
    map.setOptions({ restriction: null, maxZoom: 17 });
    map.fitBounds(b, padding);
    google.maps.event.addListenerOnce(map, 'idle', () => map.setOptions({ restriction, maxZoom: 18 }));
  };

  // outlines: counties (solid ink), towns (hairline, clickable for area facts)
  if (counties) {
    const d = new google.maps.Data({ map });
    d.addGeoJson(counties);
    d.setStyle({ fillOpacity: 0, strokeColor: '#111111', strokeOpacity: 0.7, strokeWeight: 1.2, clickable: false, zIndex: 1 });
    // mask: a world-sized paper sheet with the two counties cut out, so only what we report on shows
    const area = ring => ring.reduce((a, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return a + (x2 - x1) * (y2 + y1); }, 0);
    const holes = [];
    for (const f of counties.features) {
      const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const p of polys) {
        const outer = p[0], cw = area(outer) > 0;  // positive = clockwise in lng/lat; the world sheet is clockwise
        const pts = (cw ? [...outer].reverse() : outer).map(([lng, lat]) => ({ lat, lng }));  // holes wind the other way
        holes.push(pts);
      }
    }
    new google.maps.Polygon({ map, paths: [WORLD, ...holes], fillColor: PAPER, fillOpacity: 0.94, strokeWeight: 0, clickable: false, zIndex: 0 });
  }
  if (towns) {
    const t = new google.maps.Data({ map });
    t.addGeoJson(towns);
    t.setStyle({ fillColor: '#111111', fillOpacity: 0.025, strokeColor: '#111111', strokeOpacity: 0.3, strokeWeight: 0.7, clickable: true, zIndex: 2 });
    t.addListener('mouseover', e => t.overrideStyle(e.feature, { fillOpacity: 0.07, strokeOpacity: 0.7 }));
    t.addListener('mouseout', e => t.revertStyle(e.feature));
    t.addListener('click', e => onTown?.({ name: e.feature.getProperty('name'), facts: e.feature.getProperty('facts'),
                                          source: e.feature.getProperty('factsSource') }));
  }

  // pins: one HTML element per record, positioned by a single overlay
  const pins = records.filter(r => r.lat != null).map(r => {
    const w = document.createElement('div');
    w.className = 'pinw';
    w.innerHTML = `<div class="pin ev-${r.evidence} cat-${r.category}${r.fatal ? ' fatal' : ''}" style="--c:${CAT_COLORS[r.category] || '#111'};--h:${r.fatal ? 54 : 30 + ((r.n || 0) % 3) * 6}px" role="button" tabindex="0" aria-label="${esc(`${r.n}. ${r.place}`)}">
      <span class="pin-lbl"><b>${r.n ?? ''}</b>${esc(r.place)}</span><span class="pin-head"></span><span class="pin-stalk"></span><span class="pin-foot"></span></div>`;
    const el = w.firstElementChild;
    el.addEventListener('click', e => { e.stopPropagation(); onSelect(r); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') onSelect(r); });
    el.addEventListener('mouseenter', () => onHover?.(r));
    el.addEventListener('mouseleave', () => onHover?.(null));
    return { r, w, el, ll: new google.maps.LatLng(r.lat, r.lon), shown: false, clustered: false };
  });
  const byId = new window.Map(pins.map(p => [p.r.id, p]));
  let clusters = [], selected = null, area = [], areaBounds = null, extentKey = 'reports';
  const ready = new Promise(res => google.maps.event.addListenerOnce(map, 'idle', res));
  const COUNTY_LABELS = [['Darlington County', 34.37, -79.93], ['Florence County', 33.99, -79.66]].map(([name, lat, lng]) => {
    const w = document.createElement('div'); w.className = 'cty'; w.innerHTML = `<span>${name}</span>`;
    return { w, ll: new google.maps.LatLng(lat, lng) };
  });
  // town names (the incorporated towns and cities), at the middle of each town's largest piece; small towns
  // appear once you zoom in a step
  const TOWN_LABELS = (towns?.features || []).map(f => {
    const g = f.geometry, rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
    const ring = rings.reduce((a, r) => (r.length > a.length ? r : a), rings[0] || []);
    if (!ring.length) return null;
    const xs = ring.map(c => c[0]), ys = ring.map(c => c[1]);
    const pop = f.properties.facts?.population || 0;
    const w = document.createElement('div');
    w.className = `twn${pop >= 10000 ? ' big' : pop < 1500 ? ' small' : ''}`; w.innerHTML = `<span>${esc(f.properties.name)}</span>`;
    return { w, ll: new google.maps.LatLng((Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...xs) + Math.max(...xs)) / 2) };
  }).filter(Boolean);

  class PinLayer extends OverlayView {
    onAdd() {
      this.root = document.createElement('div');
      this.root.className = 'pinlayer';
      for (const c of [...COUNTY_LABELS, ...TOWN_LABELS]) this.root.appendChild(c.w);
      for (const p of pins) { this.root.appendChild(p.w); OverlayView.preventMapHitsAndGesturesFrom(p.w); }
      this.getPanes().overlayMouseTarget.appendChild(this.root);
    }
    draw() {
      const proj = this.getProjection();
      if (!proj) return;
      const placed = [];
      for (const p of pins) {
        const vis = p.shown && !p.clustered;
        p.w.style.display = vis ? '' : 'none';
        if (!vis) continue;
        const pt = proj.fromLatLngToDivPixel(p.ll);
        let dx = 0;  // fan out pins that would sit on top of each other
        for (const q of placed) if (Math.abs(q.x - (pt.x + dx)) < 13 && Math.abs(q.y - pt.y) < 13) dx += 15;
        placed.push({ x: pt.x + dx, y: pt.y });
        p.w.style.transform = `translate(${pt.x + dx}px,${pt.y}px)`;
        p.w.style.zIndex = p.r === selected ? 999 : Math.round(pt.y);
      }
      for (const c of [...clusters, ...COUNTY_LABELS]) {
        const pt = proj.fromLatLngToDivPixel(c.ll);
        c.w.style.transform = `translate(${pt.x}px,${pt.y}px)`;
      }
      // town names go right of the town's centre, or left / below / above when a pin or badge is in the way
      const busy = [...placed.map(q => [q.x - 9, q.y - 18, q.x + 9, q.y + 2]),
                    ...clusters.map(c => { const q = proj.fromLatLngToDivPixel(c.ll), r = 17 * (+c.w.firstElementChild?.style.getPropertyValue('--n') || 1) + 3;
                                           return [q.x - r, q.y - r, q.x + r, q.y + r]; })];
      const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      for (const t of TOWN_LABELS) {
        const pt = proj.fromLatLngToDivPixel(t.ll), w = t.w._w || (t.w._w = t.w.firstElementChild.offsetWidth) || 60, h = 14;
        const spots = [10, 30].flatMap(g => [[g, -h / 2], [-g - w, -h / 2], [-w / 2, g], [-w / 2, -g - h]]);  // near, then clear of a badge
        const [dx, dy] = spots.find(([x, y]) => !busy.some(b => hit([pt.x + x, pt.y + y, pt.x + x + w, pt.y + y + h], b))) || spots[0];
        t.w.style.transform = `translate(${Math.round(pt.x + dx)}px,${Math.round(pt.y + dy)}px)`;
      }
    }
    onRemove() { this.root?.remove(); }
  }
  const layer = new PinLayer();
  layer.setMap(map);

  // clusters (zoomed out only): 3+ nearby pins collapse into a numbered badge
  function recluster() {
    clusters.forEach(c => c.w.remove());
    clusters = [];
    const z = map.getZoom() ?? 10, vis = pins.filter(p => p.shown);
    vis.forEach(p => (p.clustered = false));
    if (z < 12 && !selected) {
      // about 56 px on screen at any zoom (1 km is ~7.9 px at zoom 10 here; a badge is 34-54 px across),
      // so neighbouring badges never overlap
      const radius = 7.1 * Math.pow(2, 10 - z), groups = [];
      const centre = g => { g.lat = g.m.reduce((a, q) => a + q.r.lat, 0) / g.m.length; g.lon = g.m.reduce((a, q) => a + q.r.lon, 0) / g.m.length; };
      for (const p of vis) {
        const g = groups.find(g => km(g, p.r) < radius);
        if (g) { g.m.push(p); centre(g); } else groups.push({ lat: p.r.lat, lon: p.r.lon, m: [p] });
      }
      for (let i = 0; i < groups.length; i++)  // centres drift as groups grow: merge any that ended up too close
        for (let j = i + 1; j < groups.length; j++)
          if (km(groups[i], groups[j]) < radius) { groups[i].m.push(...groups[j].m); centre(groups[i]); groups.splice(j, 1); j = i; }
      for (const g of groups.filter(g => g.m.length >= 3)) {
        g.m.forEach(p => (p.clustered = true));
        const w = document.createElement('div');
        w.className = 'clw';
        const fatal = g.m.filter(p => p.r.fatal).length;
        w.innerHTML = `<button class="clb" type="button" style="--n:${Math.min(1.6, 1 + g.m.length / 25)}" aria-label="${g.m.length} reports here. Zoom in">
          <b>${g.m.length}</b>${fatal ? '<i title="includes a fatal report"></i>' : ''}<span>reports · zoom in</span></button>`;
        w.firstElementChild.addEventListener('click', e => {
          e.stopPropagation();
          const b = new google.maps.LatLngBounds();
          g.m.forEach(p => b.extend(p.ll));
          fit(b, pad());
        });
        OverlayView.preventMapHitsAndGesturesFrom(w);
        layer.root?.appendChild(w);
        clusters.push({ w, ll: new google.maps.LatLng(g.lat, g.lon) });
      }
    }
    layer.draw();
  }

  // zoom: pin size class + street names only when close
  let rcTimer = 0, near = false, base = 'paper';
  const onZoom = () => {
    const z = map.getZoom() ?? 10;
    host.dataset.z = z < 11.5 ? 'far' : z < 14 ? 'mid' : 'near';
    if ((z >= 13) !== near) { near = z >= 13; if (base === 'paper') map.setOptions({ styles: near ? STYLE_NEAR : STYLE_FAR }); }
    clearTimeout(rcTimer); rcTimer = setTimeout(recluster, 80);
  };
  map.addListener('zoom_changed', onZoom);
  // the dim sheet covers three screen-widths around the view (Google won't draw a very large polygon when zoomed
  // in close), so it is re-cut to the view as the map moves; it fades in from zoom 12 to 15
  let dim = null, dimHole = null, dimRaf = 0;
  const dimFor = z => 0.5 * Math.max(0, Math.min(1, ((z ?? 10) - 12) / 3));
  const viewBox = () => {
    const b = map.getBounds(); if (!b) return null;
    const ne = b.getNorthEast(), sw = b.getSouthWest(), h = ne.lat() - sw.lat(), w = ne.lng() - sw.lng();
    return [{ lat: ne.lat() + h, lng: sw.lng() - w }, { lat: ne.lat() + h, lng: ne.lng() + w },
            { lat: sw.lat() - h, lng: ne.lng() + w }, { lat: sw.lat() - h, lng: sw.lng() - w }];
  };
  const recut = () => { const box = dim && viewBox(); if (box) dim.setOptions({ paths: [box, dimHole], fillOpacity: dimFor(map.getZoom()) }); };
  map.addListener('bounds_changed', () => { if (dim) { cancelAnimationFrame(dimRaf); dimRaf = requestAnimationFrame(recut); } });
  onZoom();

  const api = {
    map,
    setBase(b) {  // 'paper' (styled broadsheet map) or 'satellite' (Google imagery, pins stay)
      if (b === base) return;
      base = b; host.dataset.base = b;
      // plain satellite first, street names once the map settles: switched straight to 'hybrid' while the map is
      // still moving, Google sometimes draws the street names over a blank page and never loads the photos
      if (b === 'satellite') {
        map.setOptions({ styles: STYLE_SAT }); map.setMapTypeId('satellite');
        google.maps.event.addListenerOnce(map, 'idle', () => { if (base === 'satellite') map.setMapTypeId('hybrid'); });
      } else { map.setOptions({ styles: near ? STYLE_NEAR : STYLE_FAR }); map.setMapTypeId('roadmap'); }
    },
    setExtent(k) {
      extentKey = k;
      if (k === 'reports' && pins.length) {  // opening view: where the reports are, not empty county corners
        const b = new google.maps.LatLngBounds(); pins.forEach(p => b.extend(p.ll)); fit(b, pad()); return;
      }
      const e = ex[k]; if (e) fit(bounds(e), pad());
    },
    setVisible(ids) {  // ids: records that should show now (timeline + filters)
      let changed = false;
      for (const p of pins) {
        const on = ids.has(p.r.id);
        if (on === p.shown) continue;
        changed = true; p.shown = on;
        if (on) requestAnimationFrame(() => requestAnimationFrame(() => p.el.classList.add('on'))); else p.el.classList.remove('on');
      }
      if (changed) { clearTimeout(rcTimer); rcTimer = setTimeout(recluster, 40); layer.draw(); }
    },
    select(r) {
      if (selected) byId.get(selected.id)?.el.classList.remove('sel');
      const was = selected;
      selected = r;
      if (!r && was) ready.then(() => { if (!selected) api.setExtent(extentKey); });
      pins.forEach(p => p.el.classList.toggle('dim', !!r && p.r !== r));
      area.forEach(o => o.setMap(null)); area = []; dim = dimHole = null;
      const p = r && byId.get(r.id);
      if (!r || r.lat == null) { recluster(); return; }
      p?.el.classList.add('sel');  // older cases and date-uncertain reports have no pin; they get the ring alone
      recluster();
      // satellite before the camera moves: switched mid-flight, Google sometimes never loads the photos
      api.setBase('satellite');
      const ll = p ? p.ll : new google.maps.LatLng(r.lat, r.lon);
      // the reported area: a ring the size of the location's precision, or the road itself when only the road is known
      const b = new google.maps.LatLngBounds();
      if (r.roadPath?.length) {
        const path = r.roadPath.map(([lat, lng]) => ({ lat, lng }));
        area.push(new google.maps.Polyline({ map, path, strokeColor: '#f3f0e8', strokeOpacity: 0.9, strokeWeight: 9, zIndex: 5, clickable: false }),
                  new google.maps.Polyline({ map, path, strokeColor: '#c8102e', strokeOpacity: 0.95, strokeWeight: 4, zIndex: 6, clickable: false }));
        path.forEach(pt => b.extend(pt));
      } else {
        const radius = r.ringM || 90;
        area.push(new google.maps.Circle({ map, center: ll, radius, strokeColor: '#c8102e', strokeOpacity: 0.95, strokeWeight: 2.5,
                                           fillColor: '#c8102e', fillOpacity: 0.05, clickable: false, zIndex: 5 }));
        // the ring's box, computed here: Circle.getBounds() is empty until the map has drawn once
        const dLat = radius / 111320, dLng = radius / (111320 * Math.cos((r.lat * Math.PI) / 180));
        b.extend({ lat: r.lat - dLat, lng: r.lon - dLng }); b.extend({ lat: r.lat + dLat, lng: r.lon + dLng });
      }
      // dim everything outside the reported area a little, so the eye lands on it (fades in as you zoom in)
      dimHole = r.roadPath?.length ? corridorPath(r.roadPath, 120) : ringPath(r.lat, r.lon, r.ringM || 90);
      dim = new google.maps.Polygon({ map, paths: [viewBox() || boxPath(r.lat, r.lon, 3000), dimHole], fillColor: '#050505',
                                      fillOpacity: dimFor(map.getZoom()), strokeWeight: 0, clickable: false, zIndex: 4 });
      area.push(dim);
      areaBounds = b;
      ready.then(() => { if (selected === r) fit(b, padSel()); });
    },
    focus(r) {  // re-frame the selected report's area (used when returning from 3D / Street View)
      if (!r || r.lat == null) return;
      const b = areaBounds && !areaBounds.isEmpty() ? areaBounds : new google.maps.LatLngBounds({ lat: r.lat, lng: r.lon }, { lat: r.lat, lng: r.lon });
      fit(b, padSel());
    },
    hover(r) { pins.forEach(p => p.el.classList.toggle('hot', !!r && p.r === r)); },
    has: id => byId.has(id),
  };
  ready.then(() => { if (!selected) api.setExtent('reports'); });
  return api;
}
