// Panel, legend, filters, feed, incident story, town facts and timeline (broadsheet chrome).
import { CAT_COLORS } from './map.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const DOW = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'];
const d8 = s => new Date(s.slice(0, 10) + 'T12:00:00');
export const fmtDay = s => (s ? `${MON[d8(s).getMonth()]} ${d8(s).getDate()}` : 'Date unknown');
const fmtLong = s => (s ? `${DOW[d8(s).getDay()]}, ${fmtDay(s)}, ${d8(s).getFullYear()}` : 'Date unknown');
const fmtTime = t => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'a.m.' : 'p.m.'; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`; };
const TYPE = { dispatch: '911 call', news: 'News', agency: 'Agency', 'reporter post': 'Reporter', 'community post': 'Comment', tip: 'Tip', 'search result': 'Headline only', arrest: 'Arrest' };
const TYPE_CLS = { dispatch: 'dispatch', news: 'news', agency: 'agency', 'reporter post': 'news', 'community post': 'tip', tip: 'tip', 'search result': 'tip', arrest: 'arrest' };
const LOC = { block: 'Placed mid-block on the street itself', intersection: 'Placed where the two streets meet',
  street: 'Street known, block not: placed mid-street', named_place: 'Placed at the named place',
  municipality: 'Town only: placed at the town centre', none: "Couldn't be placed on the map" };
const PLACED = { 'county-address-business': 'Placed at the business named in reports, from county address records',
  'county-block': "Placed on the block itself, using the county's address records",
  'road-at-county-line': 'Placed where the named road crosses the county line' };
const locLabel = r => (r.lat == null ? "Couldn't be placed on the map" : r.roadPath ? 'The report names the road, not the block: the whole stretch is marked'
  : PLACED[r.placedBy] || LOC[r.locationPrecision] || '');
const WHEN = { call_received: 'Time the 911 call came in', discovered: 'Discovery date; when it happened is unknown',
  range: 'Happened within a date range', occurred: '' };
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};

function node(html, parent = document.body) { const d = document.createElement('div'); d.innerHTML = html.trim(); const n = d.firstChild; parent.appendChild(n); return n; }

export function mountUI(L, S, act) {
  const cats = L.categories, ev = L.evidence, catOf = Object.fromEntries(cats.map(c => [c.key, c]));
  const evOf = Object.fromEntries(ev.map(e => [e.key, e]));
  const days = L.days, st = L.stats;
  const shootings = L.records.filter(r => r.category === 'shooting').length;

  // ——— panel
  const present = cats.filter(c => st.byCategory[c.key]);
  // the state's own count for scale: murders, robberies and aggravated assaults recorded per month
  const B = L.baseline, base = cty => (B?.perMonth?.[cty] ? `<i class="cty-state" title="${esc(`${B.source}: ${B.counties[cty].murder} murders, ${B.counties[cty].robbery} robberies and ${B.counties[cty].agg_assault} aggravated assaults recorded in ${cty} County in ${B.year}.`)}">state records: ~${B.perMonth[cty]} a month (${B.year})</i>` : '');
  const nUnmapped = L.records.filter(r => r.lat == null).length + L.uncertain.length;
  const panel = node(`<header class="lede panel">
    <button class="sheet-handle" type="button" aria-label="Expand list"><i></i></button>
    <div class="mast"><p class="kicker">Florence &amp; Darlington counties, S.C.</p>
      <p class="dates">${fmtDay(L.window.start)} – ${fmtDay(L.window.end)}, ${L.window.end.slice(0, 4)} · updated ${fmtDay(L.generated)}, ${fmtTime(L.generated.slice(11, 16))}</p></div>
    <i class="sp" aria-hidden="true"></i>
    <h1 class="hl"><span class="num" id="num">0</span><span class="unit">reports of violence</span></h1>
    <p class="dek">Every public report we could find, from 911 calls and news stories to official statements and arrests. It is not a complete count.</p>
    <div class="toll" aria-label="The toll so far">
      <div class="st hot"><span class="st-k">Killed</span><b class="st-v" id="t-killed">0</b><small class="st-s">as reported</small></div>
      <div class="st" id="t-hurt-w"><span class="st-k">Hurt</span><b class="st-v" id="t-hurt">0</b><small class="st-s">where stated</small></div>
      <button type="button" class="st st-btn" id="t-arr-w" title="People booked into the two county jails on violent charges in these 30 days. Charges are allegations, not findings of guilt."><span class="st-k">Arrests</span><b class="st-v" id="t-arr">0</b><small class="st-s" id="t-arr-s">violent charges</small></button>
    </div>
    <i class="sp" aria-hidden="true"></i>
    <section class="blk" aria-labelledby="h-what">
      <h2 class="blk-h" id="h-what">What happened <small>Tap a row to hide or show it</small></h2>
      <div class="ctysplit" aria-label="By county"><span><b data-cty="Florence">0</b> Florence County${base('Florence')}</span><span><b data-cty="Darlington">0</b> Darlington County${base('Darlington')}<i title="${esc(L.coverage.Darlington)}">no public 911 feed</i></span></div>
      <ul class="bars">${present.map(c => `<li><button type="button" class="bar" data-k="${c.key}" aria-pressed="true" style="--c:${CAT_COLORS[c.key]}" title="${esc(c.sub)}">
        <i class="sw"></i><span class="bl">${esc(c.label)}</span><b class="bn">0</b><span class="bt"><span class="bf"></span></span></button></li>`).join('')}</ul>
    </section>
    <i class="sp" aria-hidden="true"></i>
    <section class="feed collapsed" aria-label="Reports">
      <div class="ticker" aria-roledescription="carousel" aria-label="Latest reports">
        <div class="tick-hd"><h2 class="blk-h">Latest reports</h2>
          <div class="tick-pg"><span id="tickn"></span><button type="button" id="tickprev" aria-label="Previous report">${ICON.back}</button><button type="button" id="ticknext" aria-label="Next report">${ICON.fwd}</button></div></div>
        <button type="button" class="tick-item" id="tickitem"></button>
        <i class="tick-bar" aria-hidden="true"><b id="tickbar"></b></i>
      </div>
      <div class="tabs" role="tablist">
        <button type="button" data-tab="live" aria-pressed="true">Latest</button>
        <button type="button" data-tab="arrests" aria-pressed="false">Arrests <em>${(L.arrests || []).length}</em></button>
        <button type="button" data-tab="older" aria-pressed="false">Older <em>${L.updates.length}</em></button>
        <button type="button" data-tab="unpinned" aria-pressed="false">${nUnmapped === L.uncertain.length ? 'Uncertain' : 'Not mapped'} <em>${nUnmapped}</em></button>
        <button type="button" class="tabs-close" aria-label="Collapse the list">×</button>
      </div>
      <div class="fhd" id="fhd"></div>
      <div class="fbody"><ol class="flist" id="flist" aria-live="polite"></ol><div class="fdetail" id="fdetail" hidden></div></div>
    </section>
    <footer class="aboutline"><button type="button" class="tick-open" id="tickopen" aria-expanded="false">Show all reports</button>
      <button type="button" class="about-link" id="aboutbtn" aria-expanded="false" aria-controls="aboutpop">About this data</button></footer>
  </header>`);
  // map key (explains the pin styles) with the unverified-tips switch
  node(`<div class="mapkey" role="note" aria-label="Map key">
    <span title="Confirmed by a news report, a reporter, or officials"><i class="glyph solid"></i>Confirmed</span>
    <span title="A 911 dispatch record not yet confirmed by news or officials"><i class="glyph hollow"></i><em class="k-l">911 call only</em><em class="k-s">911 only</em></span>
    <span><i class="glyph fatal"></i><em class="k-l">Someone died</em><em class="k-s">Fatal</em></span>
    <label title="Unconfirmed tips, such as scanner-based app reports"><input type="checkbox" id="tips"> Tips (${L.tips.length})</label></div>`);
  const about = node(`<div class="aboutpop" id="aboutpop" hidden role="dialog" aria-label="About this data">
    <button class="x" type="button" aria-label="Close">×</button><h4>About this data</h4>
    <p>Every public report we could find in the last 30 days: 911 call records, news stories, reporters' posts, official statements and arrest records. It is not a complete count.</p>
    <p>${esc(L.coverage.Darlington)}</p>
    <p>Pins sit at the start of the reported block. No house addresses or names are ever shown. Arrests are allegations, not findings of guilt.</p>
    ${L.baseline ? `<p>For scale: South Carolina's ${L.baseline.year} crime report counted about ${L.baseline.perMonth.Florence} murders, robberies and aggravated assaults a month in Florence County and about ${L.baseline.perMonth.Darlington} in Darlington County. Most never appear in any public report; the jail bookings in the Arrests list show part of the rest. <a href="${esc(L.baseline.url)}" target="_blank" rel="noopener">SLED report</a></p>` : ''}</div>`);
  const $ = s => document.querySelector(s);
  panel.querySelector('.sheet-handle').onclick = () => document.body.classList.toggle('sheet-open');

  // filters: type rows and the two "how sure" rows
  panel.querySelectorAll('.bar').forEach(b => (b.onclick = () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on); on ? S.cats.add(b.dataset.k) : S.cats.delete(b.dataset.k); act.refresh();
  }));
  document.querySelector('#tips').onchange = e => { S.tips = e.target.checked; act.refresh(); };
  const aboutBtn = panel.querySelector('#aboutbtn');
  const setAbout = open => { about.hidden = !open; aboutBtn.setAttribute('aria-expanded', open); };
  aboutBtn.onclick = () => setAbout(about.hidden);
  about.querySelector('.x').onclick = () => setAbout(false);
  panel.querySelectorAll('.tabs button[data-tab]').forEach(b => (b.onclick = () => {
    S.tab = b.dataset.tab; panel.querySelectorAll('.tabs button[data-tab]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderList(true);
  }));
  // the overview never scrolls: when its content is taller than the panel (more type rows, a short screen), drop
  // the least important lines one step at a time until it fits: the intro, the state-count lines, the county split
  const fitOverview = () => {
    panel.classList.remove('fit-1', 'fit-2', 'fit-3');
    if (document.body.classList.contains('focus') || innerWidth <= 760 || !feedEl.classList.contains('collapsed')) return;
    const over = () => panel.scrollHeight > panel.clientHeight + 1 ||
      panel.querySelector('.bars').getBoundingClientRect().bottom > feedEl.getBoundingClientRect().top - 12;
    for (let i = 1; i <= 3 && over(); i++) panel.classList.add(`fit-${i}`);
  };
  let fitRaf = 0;
  const refit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitOverview); };
  addEventListener('resize', refit);
  document.fonts?.addEventListener?.('loadingdone', refit);  // text grows when the web fonts arrive
  new ResizeObserver(refit).observe(panel.querySelector('.bars'));
  const feedEl = panel.querySelector('.feed'), tickItem = panel.querySelector('#tickitem'), tickOpen = panel.querySelector('#tickopen');
  requestAnimationFrame(fitOverview);
  const tickN = panel.querySelector('#tickn'), tickBar = panel.querySelector('#tickbar');
  const rollable = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setOpen = open => { feedEl.classList.toggle('collapsed', !open); tickOpen.setAttribute('aria-expanded', open); if (open) renderList(true); requestAnimationFrame(fitOverview); };
  tickOpen.onclick = () => setOpen(true);
  panel.querySelector('#t-arr-w').onclick = () => {
    S.tab = 'arrests'; panel.querySelectorAll('.tabs button[data-tab]').forEach(x => x.setAttribute('aria-pressed', x.dataset.tab === 'arrests')); setOpen(true);
  };
  panel.querySelector('.tabs-close').onclick = () => setOpen(false);
  let tickIdx = 0, tickSig = '', tickEntries = [];
  // one report at a time; a thin line fills while it waits, then the next rolls in (paused on hover or focus)
  function drawTick() {
    const n = tickEntries.length, e = tickEntries[tickIdx % Math.max(1, n)];
    tickN.textContent = n > 1 ? `${(tickIdx % n) + 1} of ${n}` : '';
    panel.querySelectorAll('.tick-pg button').forEach(b => (b.disabled = n < 2));
    tickBar.classList.remove('run');
    if (!e) { tickItem.innerHTML = '<span class="tk-k">Latest</span><span class="tk-t">No reports yet at this point in the timeline.</span>'; tickItem.onclick = null; return; }
    tickItem.innerHTML = `<span class="tk-k">${TYPE[e.s.type] || 'Report'} · ${e.s.date ? fmtDay(e.s.date) : ''}</span><span class="tk-t">${esc(e.s.title || e.s.kind)}</span>`;
    tickItem.classList.remove('roll'); void tickItem.offsetWidth; tickItem.classList.add('roll');
    if (rollable && n > 1) tickBar.classList.add('run');
    tickItem.onclick = () => act.select(e.r);
  }
  tickBar.addEventListener('animationend', () => { tickIdx++; drawTick(); });
  const step = d => { const n = tickEntries.length; if (n < 2) return; tickIdx = (tickIdx % n + d + n) % n; tickItem.setAttribute('aria-live', 'polite'); drawTick(); };
  panel.querySelector('#tickprev').onclick = () => step(-1);
  panel.querySelector('#ticknext').onclick = () => step(1);
  function updateTicker(playing) {
    const vis = act.visibleEntries();
    const sig = vis.length + ':' + (vis[vis.length - 1]?.key || '');
    if (sig !== tickSig) { tickSig = sig; tickEntries = [...vis].reverse().slice(0, 12); tickIdx = 0; drawTick(); }
    return playing;
  }
  const maxCat = Math.max(1, ...present.map(c => st.byCategory[c.key]));
  const tollK = panel.querySelector('#t-killed'), tollH = panel.querySelector('#t-hurt'), tollHw = panel.querySelector('#t-hurt-w'), tollA = panel.querySelector('#t-arr'), tollAs = panel.querySelector('#t-arr-s');
  // the headline number keeps the width of its final value, so "reports of violence" sits right beside it
  // and doesn't shift while the count runs up
  const numEl = panel.querySelector('#num');
  const fitNum = () => {
    const was = numEl.textContent; numEl.style.minWidth = '0'; numEl.textContent = String(L.records.length);
    const em = numEl.getBoundingClientRect().width / parseFloat(getComputedStyle(numEl).fontSize);
    numEl.textContent = was; numEl.style.minWidth = `${em.toFixed(3)}em`;
  };
  fitNum(); document.fonts?.ready.then(fitNum);
  function updateCounts(T) {  // counts at the playhead; a hidden type keeps its count so it can be turned back on
    const upTo = L.records.filter(r => r.t != null && r.t <= T);
    const vis = upTo.filter(r => S.cats.has(r.category) && S.ev.has(r.evidence)), unknown = vis.filter(r => r.injured == null).length;
    const killed = vis.reduce((a, r) => a + (r.killed || 0), 0);
    tollK.textContent = killed; tollK.parentElement.classList.toggle('hot', killed > 0);
    tollH.textContent = vis.reduce((a, r) => a + (r.injured || 0), 0);
    tollHw.title = `Includes anyone who later died. ${unknown} of ${vis.length} reports don't give a number.`;
    const arr = (L.arrests || []).filter(a => a.t == null || a.t <= T), tied = arr.filter(a => a.incident).length;
    tollA.textContent = arr.length;
    tollAs.textContent = arr.length ? `${tied} tied to a report` : 'violent charges';
    for (const el of panel.querySelectorAll('[data-cty]'))
      el.textContent = upTo.filter(r => r.county === el.dataset.cty && S.cats.has(r.category) && S.ev.has(r.evidence)).length;
    for (const b of panel.querySelectorAll('.bar')) {
      const n = upTo.filter(r => r.category === b.dataset.k && S.ev.has(r.evidence)).length;
      b.querySelector('.bn').textContent = n; b.querySelector('.bf').style.width = `${(100 * n) / maxCat}%`;
    }
  }

  // ——— tools: map extents
  const tools = node('<div class="tools"></div>');
  const exts = Object.entries(L.extents || {});
  if (exts.length) {
    const seg = node(`<div class="seg" role="group" aria-label="Map area">${exts.map(([k, v], i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${esc(v.label)}</button>`).join('')}</div>`, tools);
    const sel = node(`<select class="seg-sel" aria-label="Map area">${exts.map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>`, tools);
    const pick = k => { seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === k)); sel.value = k; act.extent(k); };
    seg.onclick = e => { const b = e.target.closest('button'); if (b) pick(b.dataset.k); };
    sel.onchange = () => pick(sel.value);
  }

  // ——— town facts card
  const town = node('<aside class="towncard" hidden aria-live="polite"></aside>');
  const n0 = v => (v == null ? '—' : Number(v).toLocaleString('en-US'));
  function showTown(t) {
    if (!t) { town.hidden = true; return; }
    const f = t.facts || {};
    town.innerHTML = `<button class="x" type="button" aria-label="Close">×</button><p class="kicker" style="margin:0">Town facts</p><h4>${esc(t.name)}</h4>
      <dl><dt>Population</dt><dd>${n0(f.population)}</dd><dt>Median age</dt><dd>${f.median_age ?? '—'}</dd>
      <dt>Median household income</dt><dd>${f.median_household_income ? '$' + n0(f.median_household_income) : '—'}</dd>
      <dt>Below poverty line</dt><dd>${f.poverty_rate_pct != null ? f.poverty_rate_pct + '%' : '—'}</dd>
      <dt>Unemployment</dt><dd>${f.unemployment_rate_pct != null ? f.unemployment_rate_pct + '%' : '—'}</dd>
      <dt>Homes rented</dt><dd>${f.renter_share_pct != null ? f.renter_share_pct + '%' : '—'}</dd></dl>
      <p>${esc(t.source || 'US Census')}. Area-wide figures for context; they describe the town, not anyone involved in a report.</p>`;
    town.hidden = false; town.querySelector('.x').onclick = () => (town.hidden = true);
  }

  // ——— timeline
  node(`<footer class="tl"><button class="play" id="play" aria-label="Pause">${ICON.pause}</button><div class="now" id="now"></div>
    <div class="track" id="track"><div class="cols" id="cols" style="grid-template-columns:repeat(${days},1fr)"></div><div class="base"></div><div class="fill" id="fill"></div><div class="head" id="head"></div>
    <div class="ticks" id="ticks" style="grid-template-columns:repeat(${days},1fr)"></div></div></footer>`);
  $('#play').onclick = () => act.togglePlay();
  const track = $('#track');
  const scrub = e => { const r = track.getBoundingClientRect(); act.setT(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * days); };
  track.addEventListener('pointerdown', e => { act.pause(); track.setPointerCapture(e.pointerId); scrub(e); track.onpointermove = scrub; });
  track.addEventListener('pointerup', () => (track.onpointermove = null));
  $('#ticks').innerHTML = Array.from({ length: days }, (_, k) => `<span>${k === 0 || k % 7 === 0 ? L.dayLabel(k) : ''}</span>`).join('');

  let dots = [];
  function drawDistribution(recs) {
    const cols = Array.from({ length: days }, () => []);
    recs.forEach(r => { if (r.t != null) cols[Math.min(days - 1, Math.floor(r.t))].push(r); });
    $('#cols').innerHTML = cols.map(rs => `<div class="col">${rs.map(r => `<i data-id="${r.id}" style="--c:${CAT_COLORS[r.category]}"></i>`).join('')}</div>`).join('');
    const byId = Object.fromEntries(recs.map(r => [r.id, r]));
    dots = [...document.querySelectorAll('.col i')].map(d => ({ d, r: byId[d.dataset.id] }));
  }

  // ——— feed
  const fhd = $('#fhd'), flist = $('#flist'), feed = panel.querySelector('.feed'), fbody = panel.querySelector('.fbody');
  let lastSig = '';
  function entryHTML(e, big = false) {
    const r = e.r, link = e.s.url ? `<a href="${esc(e.s.url)}" target="_blank" rel="noopener">${e.s.type === 'dispatch' ? 'Open 911 record' : e.s.type === 'tip' ? 'Open tip (unverified)' : 'Open source'}</a>` : esc(e.s.note || (e.s.type === 'arrest' ? 'County jail roster · names withheld' : ''));
    return `<li class="fi${big ? ' big' : ''}${r.lat == null ? ' nopin' : ''}" data-id="${r.id}" tabindex="0" style="--c:${CAT_COLORS[r.category]}"><div class="fb">
      <div class="fm"><span class="ft ft-${TYPE_CLS[e.s.type] || 'news'}">${TYPE[e.s.type] || esc(e.s.type)}</span><span class="fd">${e.s.date ? fmtDay(e.s.date) : ''}</span>${r.n ? `<span class="fp">Pin ${r.n}</span>` : '<span class="fp">Not on map</span>'}</div>
      <div class="ftl">${esc(e.s.title || e.s.kind)}${big ? `<small>${esc(e.s.kind)} · ${esc(e.s.publisher || '')}</small>` : ''}</div><div class="fr">${link}</div></div></li>`;
  }
  function wire() {
    flist.querySelectorAll('.fi[data-id]').forEach(li => {
      const r = act.find(li.dataset.id);
      li.onmouseenter = () => act.hover(r); li.onmouseleave = () => act.hover(null);
      li.onclick = e => { if (!e.target.closest('a')) act.select(r); };
      li.onkeydown = e => { if (e.key === 'Enter') act.select(r); };
    });
  }
  function renderList(force = false) {
    if (S.selected) return;
    if (force) fbody.scrollTop = 0;
    const vis = act.visibleEntries();
    if (S.tab === 'live') {
      const sig = 'live|' + vis.map(e => e.key).join(',');
      if (!force && sig === lastSig) return;
      const prev = new Set(lastSig.startsWith('live|') ? lastSig.slice(5).split(',') : []); lastSig = sig;
      fhd.innerHTML = `<h6>Reports as they came in</h6><span>${vis.length} of ${act.totalEntries()}</span>`;
      flist.innerHTML = [...vis].reverse().map(e => entryHTML(e)).join('') || '<li class="empty">No reports yet at this point in the timeline.</li>';
      flist.querySelectorAll('.fi').forEach((li, i) => { const k = [...vis].reverse()[i]?.key; if (!prev.has(k) && !force && prev.size) li.classList.add('in'); });
    } else if (S.tab === 'arrests') {
      lastSig = 'arrests';
      const A = (L.arrests || []).filter(a => a.t == null || a.t <= S.T);
      fhd.innerHTML = `<h6>Jail bookings on violent charges</h6><span>${A.length}</span>`;
      flist.innerHTML = `<li class="arr-note">Arrest records from the Florence and Darlington county jails. Charges are allegations, not findings of guilt; names are never shown. Most point to incidents with no public report yet.</li>`
        + (A.map(a => {
          const inc = a.incident && act.find(a.incident);
          return `<li class="fi arr${inc ? '' : ' nopin'}"${inc ? ` data-id="${inc.id}" tabindex="0"` : ''}><div class="fb">
            <div class="fm"><span class="ft ft-arrest">${esc(a.label)}</span><span class="fd">${fmtDay(a.booked)}</span><span class="fp">${esc(a.agency)}</span></div>
            <div class="ftl">${esc(a.charges || 'Charge details not shown')}<small>${a.offense && a.offense !== a.booked ? `Offense ${fmtDay(a.offense)} · ` : ''}${inc ? `Tied to the report at ${esc(inc.place)}` : `${esc(a.area || a.county + ' County')} · no public report found yet`}</small></div></div></li>`;
        }).join('') || '<li class="empty">No arrests yet at this point in the timeline.</li>');
    } else if (S.tab === 'older') {
      lastSig = 'older';
      fhd.innerHTML = '<h6>Older cases with news this month</h6><span>' + L.updates.length + '</span>';
      flist.innerHTML = L.updates.map(r => {
        const u = r.updatesInWindow[r.updatesInWindow.length - 1];
        return `<li class="fi nopin" data-id="${r.id}" tabindex="0" style="--c:${CAT_COLORS[r.category]}"><div class="fb"><div class="fm"><span class="ft ft-news">${TYPE[u?.type] || 'Update'}</span><span class="fd">${u?.date ? fmtDay(u.date) : ''}</span><span class="fp">From ${r.date ? fmtDay(r.date) + (r.date.slice(0, 4) !== L.window.end.slice(0, 4) ? ', ' + r.date.slice(0, 4) : '') : 'unknown date'}</span></div>
          <div class="ftl">${esc(r.place)}<small>${esc(u?.title || '')}</small></div></div></li>`;
      }).join('');
    } else {
      lastSig = 'unpinned';
      const unp = L.records.filter(r => r.lat == null), groups = {};
      unp.forEach(r => (groups[r.town || (r.county === 'county_line_unclear' ? 'County line' : r.county + ' County')] ||= []).push(r));
      fhd.innerHTML = `<h6>Reports we couldn't place on the map</h6><span>${unp.length + L.uncertain.length}</span>`;
      flist.innerHTML = Object.entries(groups).map(([g, rs]) => `<li class="grp">${esc(g)}</li>` + rs.map(r =>
        `<li class="fi nopin" data-id="${r.id}" tabindex="0" style="--c:${CAT_COLORS[r.category]}"><div class="fb"><div class="fm"><span class="ft ft-${r.evidence === 'call' ? 'dispatch' : 'news'}">${esc(catOf[r.category]?.one || r.category)}</span><span class="fd">${fmtDay(r.date)}</span></div><div class="ftl">${esc(r.place)}<small>${esc(locLabel(r))}</small></div></div></li>`).join('')).join('')
        + (L.uncertain.length ? '<li class="grp">Date uncertain (may fall outside the 30 days)</li>' + L.uncertain.map(r =>
          `<li class="fi nopin" data-id="${r.id}" tabindex="0" style="--c:${CAT_COLORS[r.category]}"><div class="fb"><div class="fm"><span class="ft ft-news">${esc(catOf[r.category]?.one || r.category)}</span><span class="fd">${r.date ? fmtDay(r.date) : ''}</span></div><div class="ftl">${esc(r.place)}</div></div></li>`).join('') : '');
    }
    wire();
  }

  // ——— selected incident: a dossier under the fixed header. A numbers strip, then (on wide screens) two columns:
  // the report (summary, people, and a story whose spacing follows elapsed time) and the place (where, the
  // closest other reports, area Census facts). Only the story and the closest-reports list scroll, inside.
  const km = (a, b) => { const R = 6371, k = Math.PI / 180, dLa = (b.lat - a.lat) * k, dLo = (b.lon - a.lon) * k;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const mi = d => (d < 0.16 ? `${Math.round(d * 3281 / 10) * 10} ft` : `${(d / 1.609).toFixed(1)} mi`);
  const ft = m => (m < 1000 ? `${Math.round((m * 3.281) / 50) * 50} ft` : `${(m / 1609).toFixed(1)} mi`);
  const wide = () => innerWidth >= 1100;
  let cur = null, ro = null;
  const fdetail = panel.querySelector('#fdetail');
  const START = { occurred: 'Happened', call_received: '911 call came in', discovered: 'Found; when it happened is unknown', range: 'Happened within a date range' };
  const DOT = { news: 'news', 'reporter post': 'news', agency: 'agency', arrest: 'arrest', dispatch: 'call', tip: 'tip', 'community post': 'tip', 'search result': 'tip' };
  const at = e => { const [y, m, d] = e.date.split('-').map(Number), [hh, mm] = (e.time || '12:00').split(':').map(Number); return Date.UTC(y, m - 1, d, hh, mm); };
  const whenTxt = e => `${fmtDay(e.date)}${e.date.slice(0, 4) !== L.window.end.slice(0, 4) ? `, ${e.date.slice(0, 4)}` : ''}${e.time ? `, ${fmtTime(e.time)}` : ''}`;
  function gapHTML(a, b) {  // the stretch of time between two story events; its height is set by layoutStory()
    let label = '', days = 0;
    if (a.date && b.date) {
      const h = (at(b) - at(a)) / 36e5; days = Math.max(0, h / 24);
      const d = Math.round(days);
      label = a.date === b.date && (!a.time || !b.time) ? 'Same day' : h < 0.05 ? 'Same time' : h < 1 ? 'Minutes later'
        : h < 20 ? `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} later` : d < 45 ? `${Math.max(1, d)} day${d <= 1 ? '' : 's'} later`
        : d < 548 ? `${Math.round(d / 30.4)} months later` : `${Math.round(d / 36.5) / 10} years later`;
    }
    const quiet = ['Same day', 'Same time', 'Minutes later'].includes(label);
    if (quiet) label = '';
    const w = (Math.sqrt(Math.min(days, 60)) + (quiet ? 0.1 : 0.35)).toFixed(3);
    let ticks = '';
    if (days >= 6 && days <= 120) {
      const t0 = at(a), t1 = at(b), step = (days > 42 ? 14 : 7) * 864e5;
      for (let t = t0 + step; t < t1 - step / 3; t += step) {
        const d = new Date(t), iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        ticks += `<i class="tk" style="top:${((100 * (t - t0)) / (t1 - t0)).toFixed(1)}%"><em>${fmtDay(iso)}</em></i>`;
      }
    }
    return `<li class="tl-gap${days > 60 ? ' long' : ''}${quiet ? ' quiet' : ''}" data-w="${w}" aria-hidden="true"><span>${label}</span>${ticks}</li>`;
  }
  function storyHTML(r) {
    const dated = r.story.filter(s => s.date).sort((a, b) => a.date.localeCompare(b.date))
      .map(s => ({ s, date: s.date.slice(0, 10), time: s.date.length > 10 ? s.date.slice(11, 16) : null }));
    const ev = [];
    if (r.date && !(dated[0] && dated[0].date <= r.date.slice(0, 10)))
      ev.push({ cap: 'start', date: r.date.slice(0, 10), time: r.time || null, label: START[r.kind] || 'Happened' });
    ev.push(...dated, ...r.story.filter(s => !s.date).map(s => ({ s, date: null, time: null })));
    const last = dated[dated.length - 1], today = L.generated.slice(0, 10), has = t => r.story.some(s => t.includes(s.type));
    const open = [r.injured == null && r.killed == null && !r.fatal && 'Was anyone hurt?',
      r.arrest !== 'supported' && 'Has anyone been arrested?',
      !has(['agency']) && 'Has any agency posted a statement?',
      !has(['news', 'reporter post']) && 'Has any news outlet reported it?'].filter(Boolean);
    ev.push({ cap: 'end', date: today, time: L.generated.slice(11, 16), kicker: 'Last checked',
      label: last && last.date >= today ? 'Up to date' : 'Nothing newer found', open,
      sub: 'Checked news sites, agency posts and jail rosters.' });
    const one = e => {
      if (e.cap) return `<li class="tl-ev cap ${e.cap}"><i class="dot" aria-hidden="true"></i><p class="tl-m"><span>${whenTxt(e)}</span>${e.kicker ? `<b>${e.kicker}</b>` : ''}</p>
        <p class="tl-t">${e.label}</p>${e.sub ? `<p class="tl-n">${e.sub}</p>` : ''}${e.open?.length ? `<p class="tl-q"><b>Still unanswered</b>${e.open.map(q => `<span>${q}</span>`).join('')}</p>` : ''}</li>`;
      const s = e.s, title = esc(s.title || s.kind), type = TYPE[s.type] || esc(s.type);
      const by = s.publisher && s.publisher !== type ? `<span>${esc(s.publisher)}</span>` : '';
      return `<li class="tl-ev t-${DOT[s.type] || 'news'}${s.type === 'arrest' ? ' boiler' : ''}"><i class="dot" aria-hidden="true"></i>
        <p class="tl-m"><span>${e.date ? whenTxt(e) : 'Date not shown'}</span><b>${type}</b>${by}</p>
        ${s.url ? `<a class="tl-t" href="${esc(s.url)}" target="_blank" rel="noopener" title="${title}">${title}<span class="ext" aria-hidden="true"> ↗</span></a>` : `<p class="tl-t" title="${title}">${title}</p>`}
        ${s.note ? `<p class="tl-n">${esc(s.note)}</p>` : s.type === 'search result' ? '<p class="tl-n">Seen in search results; we did not read the article.</p>' : ''}</li>`;
    };
    return ev.map((e, i) => (i ? gapHTML(ev[i - 1], e) : '') + one(e)).join('');
  }
  // Wide screens: the story fills its column exactly. Spare height goes to the gaps in proportion to the time
  // they cover, so a long silence reads as a long stretch of rail; too many events and the column scrolls.
  function layoutStory() {
    const box = fdetail.querySelector('.story'), list = box?.firstElementChild;
    if (!list || fdetail.hidden) return;
    const gaps = [...list.querySelectorAll('.tl-gap')];
    gaps.forEach(g => (g.style.height = ''));
    const cs = getComputedStyle(box), extra = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - list.offsetHeight;
    if (wide() && extra > 1 && gaps.length) {
      const sw = gaps.reduce((a, g) => a + +g.dataset.w, 0);
      gaps.forEach(g => (g.style.height = `${g.offsetHeight + Math.floor((extra * +g.dataset.w) / sw)}px`));
    }
    gaps.forEach(g => { g.classList.toggle('tight', g.offsetHeight < 18); g.classList.toggle('ruled', g.offsetHeight >= 34 * (g.querySelectorAll('.tk').length + 1)); });
    const dots = list.querySelectorAll('.dot'), lr = list.getBoundingClientRect();
    if (dots.length < 2) return;
    const c = d => { const b = d.getBoundingClientRect(); return b.top + b.height / 2 - lr.top; };
    list.style.setProperty('--r0', `${c(dots[0])}px`);
    list.style.setProperty('--r1', `${lr.height - c(dots[dots.length - 1])}px`);
  }
  addEventListener('resize', () => requestAnimationFrame(layoutStory));
  document.fonts?.ready.then(() => layoutStory());

  function drawIncidentBody() {
    const r = cur; if (!r) return;
    const e = evOf[r.evidence];
    const tile = (k, v, sub, cls = '', tip = '') => `<div class="st${cls}"${tip ? ` title="${esc(tip)}"` : ''}><span class="st-k">${k}</span><b class="st-v">${v}</b><small class="st-s">${sub}</small></div>`;
    const nArr = r.story.filter(s => s.type === 'arrest').length;
    const stats = [
      r.injured != null ? tile('Hurt', r.injured, r.killed ? 'including anyone who died' : r.evidence === 'news' ? 'in early reports' : 'as reported')
        : tile('Hurt', '—', 'not reported', '', 'Unknown, not zero'),
      r.killed != null ? tile('Killed', r.killed, r.killed ? 'as reported' : 'none reported', r.killed ? ' hot' : '')
        : r.fatal ? tile('Killed', '1+', 'number not stated', ' hot') : tile('Killed', '—', 'none reported'),
      r.arrest === 'supported' ? tile('Arrests', nArr || 1, 'charges are allegations', '', 'An arrest record tied to this report by name')
        : tile('Arrests', '—', 'none linked yet', '', 'No arrest record has been tied to this report by name'),
      tile('Sources', r.story.length, e ? e.label.toLowerCase() : 'unverified tip', '', e?.sub || 'Not confirmed by any agency or outlet'),
    ].join('');
    const people = (r.people || []).map(p => [p.role, p.juvenile ? 'juvenile' : null, p.age ? `${p.age}` : null, p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : null,
      p.race ? `${p.race} (as reported)` : null, p.outcome].filter(Boolean).join(', ')).join('; ');
    const cty = r.county === 'county_line_unclear' ? 'Florence–Darlington county line' : `${esc(r.county)} County`;
    const glyph = r.roadPath ? 'road' : r.ringM ? 'ring' : 'none';
    // closest other reports (by distance when mapped; otherwise the same county, newest first)
    const band = d => (d < 1.609 ? 'Within a mile' : d < 8.05 ? '1 to 5 miles' : 'Farther away');
    const others = r.lat != null
      ? L.records.filter(x => x.id !== r.id && x.lat != null).map(x => ({ x, d: km(r, x) })).sort((p, q) => p.d - q.d).slice(0, 30)
      : L.records.filter(x => x.id !== r.id && x.county === r.county).sort((p, q) => (q.date || '').localeCompare(p.date || '')).slice(0, 30).map(x => ({ x, d: null }));
    let lastBand = '';
    const near = others.map(({ x, d }) => {
      const b = d == null ? '' : band(d), g = b && b !== lastBand ? `<li class="nr-g">${b}</li>` : ''; lastBand = b;
      return `${g}<li class="nr" data-id="${x.id}" tabindex="0" style="--c:${CAT_COLORS[x.category]}"><i class="${x.evidence === 'call' ? 'hollow' : ''}${x.fatal ? ' fatal' : ''}"></i>
        <span class="nr-t">${esc(catOf[x.category]?.one || x.category)}<em>${fmtDay(x.date)}</em></span><span class="nr-d">${d == null ? '' : mi(d)}</span><span class="nr-p">${esc(x.place)}</span></li>`;
    }).join('');
    const within = others.filter(o => o.d != null && o.d < 1.609).length;
    const tf = (r.town && L.townFacts?.[r.town]) || null, cf = L.countyFacts?.[r.county] || null;
    const area = tf ? { name: r.town, f: tf } : cf ? { name: `${r.county} County`, f: cf } : null;
    const secs = [['where', 'Where'], ['story', 'Story'], ['near', 'Nearby'], ...(area ? [['area', 'Area']] : [])];
    const unc = r.uncertainty ? esc(r.uncertainty.replace(/ \| /g, '. ').replace(/^./, c => c.toUpperCase())) : '';
    const stat = (k, v) => `<div class="st"><span class="st-k">${k}</span><b class="st-v">${v}</b></div>`;
    // top to bottom: the numbers; what happened (full width, with where / who / what's uncertain); the story and the
    // closest reports side by side (the two lists that scroll); the area's Census figures across the bottom
    fdetail.innerHTML = `
      <nav class="dx-jump" aria-label="Sections">${secs.map(([k, t]) => `<button type="button" data-k="${k}">${t}</button>`).join('')}</nav>
      <div class="dx-stats">${stats}</div>
      <section class="dx-desc" aria-label="What happened">
        <p class="dx-lede">${esc(r.summary)}</p>
        <div class="dx-facts">
          <div class="fx-c fx-where" data-k="where"><b>Where</b><p class="w-t">${esc(r.town ? `${r.town}, ` : '')}${cty}</p>
            <p class="w-p"><i class="w-g ${glyph}" aria-hidden="true"></i><span>${esc(locLabel(r))}.${r.ringM && !r.roadPath ? ` The circle marks about ${ft(r.ringM)} around it.` : ''}${r.publicPlace && r.placeName ? ` At a public place: <em>${esc(r.placeName)}</em>.` : ''}</span></p></div>
          ${people ? `<div class="fx-c"><b>People</b><p>${esc(people[0].toUpperCase() + people.slice(1))}</p><small>As sources describe them. Names are never shown.</small></div>` : ''}
          ${unc ? `<div class="fx-c fx-unk"><b>What's uncertain</b><p>${unc}</p></div>` : ''}
        </div>
      </section>
      <div class="dx-cols">
        <section class="dx-a" aria-label="The story so far">
          <h6 class="dx-h" data-k="story">The story so far <span>${r.story.length} source${r.story.length === 1 ? '' : 's'}</span></h6>
          <div class="story"><ol class="tl-list">${storyHTML(r)}</ol></div>
        </section>
        <section class="dx-b" aria-label="Closest other reports">
          <h6 class="dx-h" data-k="near">${r.lat != null ? 'Closest other reports' : `Other reports in ${cty}`} <span>${r.lat != null ? `${within || 'none'} within a mile` : others.length}</span></h6>
          <ol class="near">${near || '<li class="nr-g">No other reports yet.</li>'}</ol>
        </section>
      </div>
      ${area ? `<section class="dx-area" aria-label="About ${esc(area.name)}" data-k="area">
        <p class="ar-h"><b>About ${esc(area.name)}</b><span>${esc(area.f.source || 'US Census')}. Area-wide figures for context, not about anyone involved.</span></p>
        <div class="ar-strip">${stat('Population', n0(area.f.population))}${stat('Median income', area.f.median_household_income ? '$' + n0(area.f.median_household_income) : '—')}
          ${stat('Below poverty line', area.f.poverty_rate_pct != null ? area.f.poverty_rate_pct + '%' : '—')}${stat('Unemployment', area.f.unemployment_rate_pct != null ? area.f.unemployment_rate_pct + '%' : '—')}</div>
      </section>` : ''}`;
    fdetail.scrollTop = 0;
    fdetail.querySelectorAll('.nr').forEach(li => {
      const x = act.find(li.dataset.id);
      li.onclick = () => act.select(x); li.onkeydown = ev => { if (ev.key === 'Enter') act.select(x); };
      li.onmouseenter = () => act.hover(x); li.onmouseleave = () => act.hover(null);
    });
    fdetail.querySelectorAll('.dx-jump button').forEach(b => (b.onclick = () =>
      fdetail.querySelector(`[data-k="${b.dataset.k}"]:not(button)`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    ro?.disconnect();
    ro = new ResizeObserver(() => layoutStory());
    ro.observe(fdetail.querySelector('.story'));
    requestAnimationFrame(layoutStory);
  }

  function showIncident(r, order) {
    document.body.classList.toggle('focus', !!r);
    requestAnimationFrame(fitOverview);
    cur = r;
    fdetail.hidden = !r; flist.hidden = !!r;
    if (!r) { feed.classList.remove('filtered'); lastSig = ''; renderList(true); fbody.scrollTop = 0; return; }
    feed.classList.add('filtered');
    const idx = order.indexOf(r), c = catOf[r.category] || { one: r.category }, e = evOf[r.evidence];
    const when = (r.time ? ` · ${fmtTime(r.time)}` : '') + (WHEN[r.kind] ? `<em>${WHEN[r.kind]}</em>` : r.timePrecision === 'part_of_day' ? '<em>Time of day approximate</em>' : '');
    fhd.innerHTML = `<div class="fbar2"><button class="fx" type="button">${ICON.back}<span>All reports</span></button>
      <button class="share" type="button" title="Copy a link to this report">Copy link</button>
      <div class="fstep"><button type="button" class="fprev" aria-label="Previous report" ${idx > 0 ? '' : 'disabled'}>${ICON.back}</button><span>${idx >= 0 ? idx + 1 : '–'}<i>/</i>${order.length}</span><button type="button" class="fnext" aria-label="Next report" ${idx >= 0 && idx < order.length - 1 ? '' : 'disabled'}>${ICON.fwd}</button></div></div>
      <div class="fsel"><p class="fdate">${r.kind === 'range' ? `${fmtDay(r.date)} – ${fmtDay(r.endDate)}, ${r.date.slice(0, 4)}` : fmtLong(r.date)}${when}</p>
        <h3>${esc(r.place)}</h3>
        <div class="ftags"><span class="chip" style="--c:${CAT_COLORS[r.category]}"><i></i>${esc(c.one)}</span>${e ? `<span class="chip ev">${esc(e.label)}</span>` : r.evidence === 'tip' ? '<span class="chip ev">Unverified tip</span>' : ''}${r.fatal ? '<span class="chip fatal">Fatal</span>' : ''}${r.officerInvolved ? '<span class="chip ev">Officer involved</span>' : ''}${r.arrest === 'supported' ? '<span class="chip ev">Arrest made</span>' : ''}</div></div>`;
    fhd.querySelector('.fx').onclick = () => act.select(null);
    fhd.querySelector('.fprev').onclick = () => idx > 0 && act.select(order[idx - 1]);
    fhd.querySelector('.fnext').onclick = () => idx < order.length - 1 && act.select(order[idx + 1]);
    fhd.querySelector('.share').onclick = async ev2 => {
      const url = `${location.origin}${location.pathname}#${r.id}`;
      try { await navigator.clipboard.writeText(url); ev2.target.textContent = 'Link copied'; } catch { prompt('Link to this report:', url); }
      setTimeout(() => (ev2.target.textContent = 'Copy link'), 1800);
    };
    drawIncidentBody();
  }

  return {
    drawDistribution, renderList, showIncident, showTown,
    setPlaying(p) { const b = $('#play'); b.innerHTML = p ? ICON.pause : ICON.play; b.setAttribute('aria-label', p ? 'Pause' : 'Play'); },
    frame(T, count) {
      $('#num').textContent = count;
      document.querySelector('.hl .unit').textContent = count === 1 ? 'report of violence' : 'reports of violence';
      updateCounts(T);
      updateTicker();
      for (const o of dots) o.d.classList.toggle('on', o.r && T >= o.r.t);
      const f = (T / days) * 100; $('#fill').style.width = f + '%'; $('#head').style.left = f + '%';
      const k = Math.min(days - 1, Math.floor(T)); $('#now').innerHTML = `${L.dayLabel(k)}<small>Day ${k + 1} of ${days}</small>`;
    },
    mapMessage(title, text) { node(`<div class="mapmsg" role="status"><b>${esc(title)}</b>${esc(text)}</div>`); },
  };
}
