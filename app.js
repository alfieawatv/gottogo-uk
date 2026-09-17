(function () {
  var LS_FAV = 'g2g_favs';
  var LS_RATE = 'g2g_rates';
  var LS_FILT = 'g2g_filter';
  var LS_RAD = 'g2g_radius';
  var LS_THEME = 'g2g_theme';
  var LS_CACHE = 'g2g_cache';

  var state = {
    all: [], static: [], nearby: [], filter: localStorage.getItem(LS_FILT) || 'all',
    userLat: null, userLng: null,
    focusLat: null, focusLng: null,
    searchLock: false,
    map: null, cluster: null, userMarker: null,
    markers: new Map(), selected: null,
    radiusKm: parseFloat(localStorage.getItem(LS_RAD)) || 5,
    locating: false, loading: false, offline: false,
    favs: loadJson(LS_FAV, {}),
    rates: loadJson(LS_RATE, {})
  };

  var GQL = 'https://www.toiletmap.org.uk/api';
  var PROXIMITY_QUERY = 'query($from: ProximityInput!) { loosByProximity(from: $from) { id name accessible babyChange radar allGender noPayment notes openingTimes paymentDetails location { lat lng } area { name } } }';
  var STATIC_URLS = ['./toilets.json', 'https://gottogo-uk.vercel.app/toilets.json'];
  var staticLoaded = false;

  function $(id) { return document.getElementById(id); }
  function loadJson(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function saveJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function toast(msg, ms) {
    ms = ms || 2600;
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms);
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {}
  }

  function haversine(a, b, c, d) {
    var R = 6371e3, r = Math.PI / 180;
    var x = (c - a) * r, y = (d - b) * r;
    var s = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function formatDist(m) {
    if (m == null) return '';
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }

  // Prefer distance from the user when GPS is known (even if list is for a searched area)
  function displayDist(t) {
    if (!t) return null;
    if (t.userDist != null && !isNaN(t.userDist)) return t.userDist;
    return t.dist;
  }

  function walkMins(m) {
    if (m == null || isNaN(m)) return '';
    var pathM = m * 1.25;
    var mins = Math.round(pathM / 75);
    if (mins < 1) return '< 1 min walk';
    if (mins === 1) return '~1 min walk';
    if (mins < 60) return '~' + mins + ' min walk';
    var h = Math.floor(mins / 60);
    var r = mins % 60;
    return r ? '~' + h + ' h ' + r + ' min walk' : '~' + h + ' h walk';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  }

  var BAD = /\b(fuck(?:ing|ed|er|s)?|shit(?:ty|s)?|bollocks|bastard(?:s)?|arse(?:hole)?s?|asshole(?:s)?|cunt(?:s)?|twat(?:s)?|dick(?:head)?s?|cock(?:s)?|piss(?:ing|ed)?|wank(?:er|ing)?s?|motherfuck(?:er|ing)?s?|bloody hell)\b/gi;
  function censor(s) {
    if (!s) return '';
    return String(s).replace(BAD, function (m) {
      if (m.length <= 1) return '#';
      return m[0] + '#'.repeat(m.length - 1);
    });
  }

  function isOpenNow(openingTimes) {
    if (!openingTimes || !openingTimes.length) return null;
    var d = new Date();
    var day = (d.getDay() + 6) % 7;
    var slot = openingTimes[day];
    if (!slot || slot.length < 2 || !slot[0] || !slot[1]) return null;
    var now = d.getHours() * 60 + d.getMinutes();
    function parse(t) {
      var p = String(t).split(':');
      return (+p[0] || 0) * 60 + (+p[1] || 0);
    }
    var o = parse(slot[0]), c = parse(slot[1]);
    if (c < o) return now >= o || now <= c;
    return now >= o && now <= c;
  }

  function formatHours(openingTimes) {
    if (!openingTimes || !openingTimes.length) return null;
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var d = new Date();
    var day = (d.getDay() + 6) % 7;
    var slot = openingTimes[day];
    if (slot && slot[0] && slot[1]) return days[day] + ' ' + slot[0] + '\u2013' + slot[1];
    return null;
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: false, attributionControl: true }).setView([54.5, -2.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    }).addTo(state.map);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    state.cluster = L.markerClusterGroup({
      maxClusterRadius: 48, spiderfyOnMaxZoom: true,
      showCoverageOnHover: false, disableClusteringAtZoom: 16
    });
    state.map.addLayer(state.cluster);
    var moveTimer;
    state.map.on('moveend', function () {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(function () {
        var btn = $('searchAreaBtn');
        if (!btn) return;
        if (state.focusLat == null) {
          if (state.map.getZoom() >= 10) btn.hidden = false;
          return;
        }
        var c = state.map.getCenter();
        var d = haversine(state.focusLat, state.focusLng, c.lat, c.lng);
        btn.hidden = d < 1200;
      }, 200);
    });
  }

  function pinIcon(selected) {
    return L.divIcon({
      className: '',
      html: '<div class="pin' + (selected ? ' selected' : '') + '"><span>\ud83d\udebd</span></div>',
      iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30]
    });
  }

  function setUser(lat, lng) {
    if (state.userMarker) state.userMarker.setLatLng([lat, lng]);
    else {
      state.userMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 2000
      }).addTo(state.map);
    }
  }

  function setSplashStatus(msg) {
    var splash = $('splash');
    if (!splash || splash.classList.contains('hide')) return;
    var p = splash.querySelector('[data-status]');
    if (p) p.textContent = msg;
  }

  function showSplashSpinner() {
    var splash = $('splash');
    if (!splash) return;
    if (!splash.querySelector('.spinner')) {
      var spin = document.createElement('div');
      spin.className = 'spinner';
      spin.setAttribute('aria-hidden', 'true');
      var bar = splash.querySelector('.splash-bar');
      if (bar) bar.replaceWith(spin);
      else splash.appendChild(spin);
    }
    if (!splash.querySelector('[data-status]')) {
      var st = document.createElement('p');
      st.setAttribute('data-status', '');
      st.style.cssText = 'color:var(--muted);font-size:.85rem;margin-top:4px;text-align:center;max-width:260px';
      st.textContent = 'Loading UK toilet data\u2026';
      splash.appendChild(st);
    }
  }

  function normalizeRawToilet(t) {
    if (!t) return null;
    if (t.i && t.lat != null && t.lng != null) {
      return {
        i: t.i, n: censor(t.n || 'Public Toilet'), a: t.a || '',
        lat: +t.lat, lng: +t.lng,
        w: t.w || 0, f: (t.f == null ? -1 : t.f), b: t.b || 0, r: t.r || 0, g: t.g || 0,
        note: t.note ? censor(t.note) : null,
        pay: t.pay ? censor(String(t.pay)) : null,
        ot: t.ot || null,
        open: isOpenNow(t.ot), hours: formatHours(t.ot)
      };
    }
    if (t.active === false) return null;
    var loc = t.location || {};
    var lat = loc.lat, lng = loc.lng;
    if (lat == null && loc.coordinates) {
      lng = loc.coordinates[0]; lat = loc.coordinates[1];
    }
    if (lat == null || lng == null) return null;
    var area = '';
    if (Array.isArray(t.areas) && t.areas[0]) area = t.areas[0].name || '';
    else if (Array.isArray(t.area) && t.area[0]) area = t.area[0].name || '';
    else if (t.area && typeof t.area === 'object' && t.area.name) area = t.area.name || '';
    var ot = t.opening_times || t.openingTimes || null;
    return {
      i: t.id,
      n: censor((t.name && String(t.name).trim()) || 'Public Toilet'),
      a: area,
      lat: +lat, lng: +lng,
      w: t.accessible === true ? 1 : 0,
      f: (t.no_payment === true || t.noPayment === true) ? 0 : ((t.no_payment === false || t.noPayment === false) ? 1 : -1),
      b: (t.baby_change === true || t.babyChange === true) ? 1 : 0,
      r: t.radar === true ? 1 : 0,
      g: (t.all_gender === true || t.allGender === true) ? 1 : 0,
      note: (t.notes ? censor(String(t.notes).slice(0, 400)) : null),
      pay: (t.payment_details || t.paymentDetails) ? censor(String(t.payment_details || t.paymentDetails).slice(0, 120)) : null,
      ot: ot,
      open: isOpenNow(ot),
      hours: formatHours(ot)
    };
  }

  async function fetchProximity(lat, lng, maxDistance) {
    maxDistance = maxDistance || 8000;
    var body = JSON.stringify({
      query: PROXIMITY_QUERY,
      variables: { from: { lat: +lat, lng: +lng, maxDistance: +maxDistance } }
    });
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { try { controller.abort(); } catch (e) {} }, 18000) : null;
    var res = await fetch(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body,
      signal: controller ? controller.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'API error');
    var loos = (json && json.data && json.data.loosByProximity) || [];
    var list = [];
    for (var i = 0; i < loos.length; i++) {
      var n = normalizeRawToilet(loos[i]);
      if (n) list.push(n);
    }
    return list;
  }

  async function loadStatic() {
    setSplashStatus('Loading UK toilet dataset\u2026');
    showSplashSpinner();
    var lastErr = null;
    for (var u = 0; u < STATIC_URLS.length; u++) {
      try {
        setSplashStatus('Loading toilet data\u2026');
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { try { controller.abort(); } catch (e) {} }, 20000) : null;
        var res = await fetch(STATIC_URLS[u], { cache: 'force-cache', signal: controller ? controller.signal : undefined });
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var raw = await res.json();
        if (!Array.isArray(raw) || !raw.length) throw new Error('Empty dataset');
        var list = [];
        for (var i = 0; i < raw.length; i++) {
          var n = normalizeRawToilet(raw[i]);
          if (n) list.push(n);
        }
        if (!list.length) throw new Error('Empty dataset');
        state.static = list;
        staticLoaded = true;
        state.all = list;
        saveJson(LS_CACHE, { at: Date.now(), n: list.length });
        $('meta').textContent = list.length.toLocaleString() + ' UK toilets loaded';
        return list;
      } catch (e) {
        lastErr = e;
        console.warn('Static load failed', STATIC_URLS[u], e);
      }
    }
    try {
      setSplashStatus('Connecting to live toilet API\u2026');
      var seed = await fetchProximity(51.5074, -0.1278, 12000);
      if (seed && seed.length) {
        state.static = seed;
        staticLoaded = false;
        state.all = seed;
        $('meta').textContent = seed.length + ' toilets (live)';
        return seed;
      }
    } catch (e2) {
      lastErr = e2;
    }
    throw lastErr || new Error('Could not load toilet dataset');
  }

  async function loadData() {
    showSplashSpinner();
    showSkeletons();
    try {
      await loadStatic();
    } catch (e) {
      console.warn(e);
      throw e;
    }
  }

  function showSkeletons() {
    $('list').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  }

  function friendlyError(err) {
    var msg = (err && err.message) ? String(err.message) : '';
    var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (offline || /failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
      return { title: 'No connection', body: 'Can\u2019t reach the internet. Check Wi\u2011Fi or mobile data, then try again.' };
    }
    if (/timeout|aborted|timed out/i.test(msg)) {
      return { title: 'Taking too long', body: 'The connection is slow or timed out. Try again on a stronger signal.' };
    }
    if (/HTTP 404|empty dataset|could not load toilet/i.test(msg)) {
      return { title: 'Data unavailable', body: 'Toilet data couldn\u2019t be downloaded right now. Please try again in a moment.' };
    }
    if (/HTTP 5\d\d|server/i.test(msg)) {
      return { title: 'Server problem', body: 'Something went wrong on the server. Please try again shortly.' };
    }
    return { title: 'Couldn\u2019t load', body: 'Something went wrong loading toilets. Check your connection and try again.' };
  }

  function errorActionsHtml(retryId) {
    return '<div style="margin-top:16px;display:flex;justify-content:center">' +
      '<button type="button" class="btn primary" id="' + retryId + '" style="width:auto;min-width:140px;max-width:200px;padding:12px 24px;box-sizing:border-box;flex:0 0 auto">Try again</button></div>';
  }

  function matches(t) {
    var f = state.filter;
    if (f === 'all') return true;
    if (f === 'accessible') return t.w === 1;
    if (f === 'free') return t.f === 0;
    if (f === 'baby') return t.b === 1;
    if (f === 'radar') return t.r === 1;
    if (f === 'gender') return t.g === 1;
    if (f === 'open') return t.open === true;
    if (f === 'fav') return !!state.favs[t.i];
    return true;
  }

  async function refreshNearby() {
    if (!state.map || state.loading) return;
    var c = state.map.getCenter();
    var lat = state.focusLat != null ? state.focusLat : c.lat;
    var lng = state.focusLng != null ? state.focusLng : c.lng;
    var max = state.radiusKm * 1000;
    state.loading = true;
    $('meta').textContent = 'Finding nearby\u2026';
    showSkeletons();
    try {
      var items = [];
      if (staticLoaded && state.static && state.static.length > 500) {
        for (var i = 0; i < state.static.length; i++) {
          var t = state.static[i];
          var d = haversine(lat, lng, t.lat, t.lng);
          if (d <= max) {
            var ud = null;
            if (state.userLat != null && state.userLng != null) {
              ud = haversine(state.userLat, state.userLng, t.lat, t.lng);
            }
            items.push({
              i: t.i, n: t.n, a: t.a, lat: t.lat, lng: t.lng,
              w: t.w, f: t.f, b: t.b, r: t.r, g: t.g,
              note: t.note || null, pay: t.pay || null,
              ot: t.ot || null, open: t.open, hours: t.hours, dist: d, userDist: ud
            });
          }
        }
      } else {
        var live = await fetchProximity(lat, lng, Math.max(max, 3000));
        for (var j = 0; j < live.length; j++) {
          var t2 = live[j];
          var d2 = haversine(lat, lng, t2.lat, t2.lng);
          if (d2 <= max) {
            t2.dist = d2;
            t2.userDist = (state.userLat != null && state.userLng != null)
              ? haversine(state.userLat, state.userLng, t2.lat, t2.lng)
              : null;
            items.push(t2);
          }
        }
        if (live.length && !state.static.length) state.static = live;
      }
      items.sort(function (a, b) { return a.dist - b.dist; });
      state.all = items;
      state.offline = false;
      if ($('offlineBanner')) $('offlineBanner').hidden = true;
      applyList();
    } catch (e) {
      console.warn(e);
      var fe2 = friendlyError(e);
      $('meta').textContent = fe2.title;
      $('list').innerHTML = '<div class="empty"><div class="emoji">\ud83d\udce1</div><h3>' + fe2.title + '</h3><p>' + fe2.body + '</p>' + errorActionsHtml('listRetry') + '</div>';
      var lr = document.getElementById('listRetry');
      if (lr) lr.onclick = function () { location.reload(); };
    } finally {
      state.loading = false;
    }
  }

  function applyList() {
    var list = state.all.filter(matches).sort(function (a, b) { return a.dist - b.dist; });
    state.nearby = list.slice(0, 250);
    renderList();
    renderMarkers(list.slice(0, 600));
  }

  function renderList() {
    var el = $('list');
    var n = state.nearby.length;
    var ofYou = state.focusLat != null && state.userLat != null && Math.abs(state.focusLat - state.userLat) < 1e-8 && Math.abs(state.focusLng - state.userLng) < 1e-8;
    var where = ofYou ? 'of you' : (state.focusLat != null ? 'of search' : 'of map centre');
    var extra = (!ofYou && state.userLat != null) ? ' \u00b7 walk times from you' : '';
    $('meta').textContent = n ? (n + ' within ' + state.radiusKm + ' km ' + where + extra) : ('No matches within ' + state.radiusKm + ' km');
    if (!n) {
      el.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udd0d</div><h3>Nothing nearby</h3><p>Try a larger radius, clear filters,<br/>or search a town / postcode.</p><div style="margin-top:16px;display:flex;justify-content:center"><button class="btn primary" style="width:auto;min-width:140px;max-width:200px;padding:12px 24px;flex:0 0 auto" id="emptyRadius">Set radius 10 km</button></div></div>';
      var b = document.getElementById('emptyRadius');
      if (b) b.onclick = function () { $('radius').value = '10'; state.radiusKm = 10; localStorage.setItem(LS_RAD, '10'); refreshNearby(); };
      return;
    }
    el.innerHTML = state.nearby.map(function (t) {
      var badges = [];
      if (t.open === true) badges.push('<span class="badge open">Open</span>');
      if (t.open === false) badges.push('<span class="badge closed">Closed</span>');
      if (t.w) badges.push('<span class="badge ok">\u267f</span>');
      if (t.f === 0) badges.push('<span class="badge">Free</span>');
      if (t.f === 1) badges.push('<span class="badge fee">Fee</span>');
      if (t.b) badges.push('<span class="badge">Baby</span>');
      if (t.r) badges.push('<span class="badge info">RADAR</span>');
      if (state.favs[t.i]) badges.push('<span class="badge fee">\u2605</span>');
      return '<div class="card' + (state.selected === t.i ? ' active' : '') + '" data-id="' + t.i + '" role="button" tabindex="0">' +
        '<div class="card-icon">\ud83d\udebd</div><div class="card-body">' +
        '<div class="card-name">' + esc(t.n) + '</div>' +
        '<div class="card-sub">' + (t.a ? '<span>' + esc(t.a) + '</span>' : '') + badges.join('') + '</div></div>' +
        '<div class="card-dist">' + formatDist(displayDist(t)) + '<div class="card-walk">' + walkMins(displayDist(t)) + '</div></div></div>';
    }).join('');
    el.querySelectorAll('.card').forEach(function (card) {
      card.onclick = function () { select(card.dataset.id); };
      card.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(card.dataset.id); }
      };
    });
  }

  function renderMarkers(items) {
    state.cluster.clearLayers();
    state.markers.clear();
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      var m = L.marker([t.lat, t.lng], { icon: pinIcon(state.selected === t.i), title: t.n });
      m.bindPopup('<strong>' + esc(t.n) + '</strong><br/><span style="color:#94a3b8;font-size:12px">' + esc(t.a || '') + '</span><br/><span style="color:#2dd4bf;font-weight:600">' + formatDist(displayDist(t)) + '</span>');
      (function (id) { m.on('click', function () { select(id, false); }); })(t.i);
      state.cluster.addLayer(m);
      state.markers.set(t.i, m);
    }
  }

  function select(id, pan) {
    if (pan === undefined) pan = true;
    var t = state.nearby.find(function (x) { return x.i === id; }) || state.all.find(function (x) { return x.i === id; });
    if (!t) return;
    state.selected = id;
    vibrate(10);
    renderList();
    renderMarkers(state.nearby.slice(0, 600));
    if (pan) {
      state.map.setView([t.lat, t.lng], Math.max(state.map.getZoom(), 16), { animate: true });
      var m = state.markers.get(id);
      if (m) setTimeout(function () { m.openPopup(); }, 200);
    }
    showDetail(t);
  }

  function showDetail(t) {
    var el = $('detail');
    var badges = [];
    if (t.open === true) badges.push('<span class="badge open">Open now</span>');
    if (t.open === false) badges.push('<span class="badge closed">Likely closed</span>');
    if (t.w) badges.push('<span class="badge ok">\u267f Wheelchair accessible</span>');
    if (t.f === 0) badges.push('<span class="badge">Free to use</span>');
    if (t.f === 1) badges.push('<span class="badge fee">May charge a fee</span>');
    if (t.b) badges.push('<span class="badge">Baby changing</span>');
    if (t.r) badges.push('<span class="badge info">RADAR key</span>');
    if (t.g) badges.push('<span class="badge">All-gender</span>');
    var maps = 'https://www.google.com/maps/dir/?api=1&destination=' + t.lat + ',' + t.lng + '&travelmode=walking';
    var tm = 'https://www.toiletmap.org.uk/loos/' + t.i;
    var isFav = !!state.favs[t.i];
    var myRate = state.rates[t.i] || 0;
    el.innerHTML =
      '<button class="back" id="backBtn">\u2190 Back to list</button>' +
      '<h2>' + esc(t.n) + '</h2>' +
      '<div class="sub">' + (t.a ? esc(t.a) + ' \u00b7 ' : '') + formatDist(displayDist(t)) + ' \u00b7 ' + walkMins(displayDist(t)) + '</div>' +
      '<div class="actions">' +
        '<a class="btn primary" href="' + maps + '" target="_blank" rel="noopener">Directions</a>' +
        '<button class="btn' + (isFav ? ' fav-on' : '') + '" type="button" id="favBtn">' + (isFav ? '\u2605 Saved' : '\u2606 Save') + '</button>' +
        '<button class="btn" type="button" id="shareBtn">Share</button>' +
      '</div>' +
      '<div class="tags">' + badges.join('') + '</div>' +
      '<div class="grid">' +
        '<div class="stat"><div class="stat-l">Distance</div><div class="stat-v">' + (formatDist(displayDist(t)) || '\u2014') + '</div></div>' +
        '<div class="stat"><div class="stat-l">Walk</div><div class="stat-v">' + walkMins(displayDist(t)) + '</div></div>' +
        (t.hours ? '<div class="stat" style="grid-column:1/-1"><div class="stat-l">Hours today</div><div class="stat-v">' + esc(t.hours) + '</div></div>' : '') +
        (t.pay ? '<div class="stat" style="grid-column:1/-1"><div class="stat-l">Payment</div><div class="stat-v">' + esc(t.pay) + '</div></div>' : '') +
      '</div>' +
      (t.note ? '<div class="note">' + esc(t.note) + '</div>' : '') +
      '<div class="rate"><span style="font-size:.85rem;color:var(--muted)">Your rating:</span>' +
        [1,2,3,4,5].map(function (n) {
          return '<button type="button" data-r="' + n + '" class="' + (myRate >= n ? 'on' : '') + '">\u2605</button>';
        }).join('') + '</div>' +
      '<p style="margin:10px 0 4px;font-size:.8rem;color:var(--muted)"><a href="' + tm + '" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:underline">Report on TM</a></p>' +
      '<p style="margin:0 0 12px;font-size:.85rem;font-weight:600;color:var(--text)">Created by Alfie Watts</p>' +
      '<div class="credit">Contains data from the <a href="https://www.toiletmap.org.uk/dataset" target="_blank" rel="noopener">Toilet Map</a> \u00a9 Public Convenience Ltd \u2014 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Location stays on your device.<br/>App by Alfie Watts.</div>';
    el.classList.add('open');
    $('backBtn').onclick = function () {
      el.classList.remove('open');
      state.selected = null;
      renderList();
      renderMarkers(state.nearby.slice(0, 600));
    };
    $('favBtn').onclick = function () {
      if (state.favs[t.i]) delete state.favs[t.i];
      else state.favs[t.i] = { n: t.n, lat: t.lat, lng: t.lng, a: t.a };
      saveJson(LS_FAV, state.favs);
      vibrate(15);
      toast(state.favs[t.i] ? 'Saved to favourites' : 'Removed from favourites');
      showDetail(t);
      applyList();
    };
    $('shareBtn').onclick = async function () {
      var data = { title: t.n, text: t.n + (t.a ? ' \u2014 ' + t.a : ''), url: 'https://www.google.com/maps?q=' + t.lat + ',' + t.lng };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(data.text + '\n' + data.url); toast('Link copied'); }
      } catch (e) {}
    };
    el.querySelectorAll('.rate button').forEach(function (btn) {
      btn.onclick = function () {
        state.rates[t.i] = +btn.dataset.r;
        saveJson(LS_RATE, state.rates);
        toast('Rated ' + btn.dataset.r + '\u2605 (saved on this device)');
        showDetail(t);
      };
    });
  }

  function goNearest() {
    if (!state.nearby.length) { toast('No toilets loaded yet'); return; }
    var t = state.nearby[0];
    select(t.i, true);
    toast('Nearest: ' + t.n);
  }

  function locate() {
    if (!navigator.geolocation) { toast('Location not supported'); return; }
    if (state.locating) return;
    state.searchLock = false;
    state.locating = true;
    $('locateBtn').classList.add('active');
    toast('Finding your location\u2026');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        state.locating = false;
        $('locateBtn').classList.remove('active');
        if (state.searchLock) return;
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        state.focusLat = state.userLat;
        state.focusLng = state.userLng;
        setUser(state.userLat, state.userLng);
        state.map.setView([state.userLat, state.userLng], 14);
        refreshNearby();
        var btn = $('searchAreaBtn');
        if (btn) btn.hidden = true;
        toast('Toilets near you');
      },
      function (err) {
        state.locating = false;
        $('locateBtn').classList.remove('active');
        toast(err.code === 1 ? 'Location permission denied' : 'Could not get location');
        refreshNearby();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  function hideSuggest() {
    var box = $('searchSuggest');
    if (!box) return;
    box.classList.remove('open');
    box.hidden = true;
    box.innerHTML = '';
  }

  function showSuggest(items) {
    var box = $('searchSuggest');
    if (!box) return;
    if (!items || !items.length) { hideSuggest(); return; }
    box.hidden = false;
    box.classList.add('open');
    box.innerHTML = items.map(function (it, idx) {
      var parts = (it.display_name || '').split(',');
      var main = parts[0] ? parts[0].trim() : 'Place';
      var sub = parts.slice(1, 4).map(function (s) { return s.trim(); }).join(', ');
      return '<button type="button" role="option" data-i="' + idx + '">' +
        '<span class="suggest-main">' + esc(main) + '</span>' +
        (sub ? '<span class="suggest-sub">' + esc(sub) + '</span>' : '') +
        '</button>';
    }).join('');
    box._items = items;
    box.querySelectorAll('button').forEach(function (btn) {
      btn.onclick = function () {
        var it = box._items[+btn.dataset.i];
        if (it) pickPlace(it);
      };
    });
  }

  async function pickPlace(it) {
    hideSuggest();
    state.searchLock = true;
    var lat = parseFloat(it.lat), lng = parseFloat(it.lon);
    state.focusLat = lat;
    state.focusLng = lng;
    var label = (it.display_name || '').split(',').slice(0, 2).join(',').trim();
    if ($('search')) $('search').value = label;
    $('searchBox').classList.add('has-value');
    state.map.setView([lat, lng], 13);
    if (state.radiusKm < 8) { $('radius').value = '10'; state.radiusKm = 10; localStorage.setItem(LS_RAD, '10'); }
    toast('Searching near ' + label + '\u2026');
    try {
      await refreshNearby();
      var btn = $('searchAreaBtn');
      if (btn) btn.hidden = true;
      toast(label);
    } catch (e) {
      toast('Could not load toilets for that place');
    }
  }

  var suggestTimer = null;
  var lastSuggestQ = '';

  async function fetchSuggestions(q) {
    if (!q || q.length < 2) { hideSuggest(); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast('No signal \u2014 connect to search');
      hideSuggest();
      return;
    }
    lastSuggestQ = q;
    try {
      var url = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&addressdetails=0&q=' +
        encodeURIComponent(q) + '&limit=6';
      var res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GotToGo/3.1' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (lastSuggestQ !== q) return;
      if (!data.length) {
        hideSuggest();
        toast('No matching places');
        return;
      }
      showSuggest(data);
    } catch (e) {
      hideSuggest();
      toast('Search failed \u2014 check connection');
    }
  }

  async function searchPlace(q) {
    if (!q || q.length < 2) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast('No signal \u2014 connect to search');
      return;
    }
    toast('Searching\u2026');
    try {
      var url = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=' + encodeURIComponent(q) + '&limit=6';
      var res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GotToGo/3.1' } });
      var data = await res.json();
      if (!data.length) { toast('No place found in the UK'); hideSuggest(); return; }
      if (data.length === 1) {
        await pickPlace(data[0]);
      } else {
        showSuggest(data);
        toast('Pick a place from the list');
      }
    } catch (e) { toast('Search failed \u2014 check connection'); }
  }

  function searchThisArea() {
    var c = state.map.getCenter();
    state.searchLock = true;
    state.focusLat = c.lat;
    state.focusLng = c.lng;
    refreshNearby();
    toast('Searching this area');
    var btn = $('searchAreaBtn');
    if (btn) btn.hidden = true;
  }

  function applyTheme() {
    var t = localStorage.getItem(LS_THEME) || 'dark';
    document.body.classList.toggle('light', t === 'light');
  }

  function setPanelMode(mode) {
    var p = $('panel');
    if (!p) return;
    p.classList.remove('expanded', 'collapsed');
    document.body.classList.remove('panel-collapsed', 'panel-expanded', 'panel-mid');
    if (mode === 'expanded') {
      p.classList.add('expanded');
      document.body.classList.add('panel-expanded');
      $('expandBtn').textContent = 'Shrink';
    } else if (mode === 'collapsed') {
      p.classList.add('collapsed');
      document.body.classList.add('panel-collapsed');
      $('expandBtn').textContent = 'Expand';
    } else {
      document.body.classList.add('panel-mid');
      $('expandBtn').textContent = 'Expand';
    }
    try { localStorage.setItem('g2g_panel', mode); } catch (e) {}
  }
  function cyclePanel() {
    var p = $('panel');
    if (p.classList.contains('collapsed')) setPanelMode('mid');
    else if (p.classList.contains('expanded')) setPanelMode('collapsed');
    else setPanelMode('expanded');
  }

  $('locateBtn').onclick = locate;
  $('fabLocate').onclick = locate;
  $('fabNearest').onclick = goNearest;
  if ($('searchAreaBtn')) $('searchAreaBtn').onclick = searchThisArea;
  $('themeBtn').onclick = function () {
    var next = document.body.classList.contains('light') ? 'dark' : 'light';
    localStorage.setItem(LS_THEME, next);
    applyTheme();
  };
  $('radius').value = String(state.radiusKm);
  $('radius').onchange = function (e) {
    state.radiusKm = parseFloat(e.target.value) || 5;
    localStorage.setItem(LS_RAD, String(state.radiusKm));
    refreshNearby();
  };
  document.querySelectorAll('.chip').forEach(function (c) {
    if (c.dataset.f === state.filter) {
      document.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
    }
  });
  $('toolbar').onclick = function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    state.filter = chip.dataset.f;
    localStorage.setItem(LS_FILT, state.filter);
    applyList();
  };
  var searchInput = $('search');
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(suggestTimer);
      searchPlace(searchInput.value.trim());
    } else if (e.key === 'Escape') {
      hideSuggest();
    }
  });
  searchInput.addEventListener('input', function () {
    $('searchBox').classList.toggle('has-value', searchInput.value.length > 0);
    clearTimeout(suggestTimer);
    var q = searchInput.value.trim();
    if (q.length < 2) { hideSuggest(); return; }
    suggestTimer = setTimeout(function () { fetchSuggestions(q); }, 350);
  });
  searchInput.addEventListener('blur', function () {
    setTimeout(hideSuggest, 180);
  });
  $('searchClear').onclick = function () {
    searchInput.value = '';
    $('searchBox').classList.remove('has-value');
    hideSuggest();
    searchInput.focus();
  };
  $('expandBtn').onclick = cyclePanel;
  (function () {
    var handle = $('handle');
    if (!handle) return;
    var startY = 0, startMode = 'mid', dragging = false, moved = false;
    function modeNow() {
      var p = $('panel');
      if (p.classList.contains('collapsed')) return 'collapsed';
      if (p.classList.contains('expanded')) return 'expanded';
      return 'mid';
    }
    function onStart(y) { dragging = true; moved = false; startY = y; startMode = modeNow(); }
    function onMove(y) {
      if (!dragging) return;
      var dy = startY - y;
      if (Math.abs(dy) > 24) moved = true;
      if (dy > 40) {
        if (startMode === 'collapsed') setPanelMode('mid');
        else setPanelMode('expanded');
      } else if (dy < -40) {
        if (startMode === 'expanded') setPanelMode('mid');
        else setPanelMode('collapsed');
      }
    }
    function onEnd() { dragging = false; }
    handle.addEventListener('touchstart', function (e) { if (e.touches[0]) onStart(e.touches[0].clientY); }, { passive: true });
    handle.addEventListener('touchmove', function (e) { if (e.touches[0]) onMove(e.touches[0].clientY); }, { passive: true });
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('mousedown', function (e) { onStart(e.clientY); });
    window.addEventListener('mousemove', function (e) { onMove(e.clientY); });
    window.addEventListener('mouseup', onEnd);
    handle.addEventListener('click', function () { if (!moved) cyclePanel(); });
  })();
  try {
    var saved = localStorage.getItem('g2g_panel');
    if (saved === 'collapsed' || saved === 'expanded' || saved === 'mid') setPanelMode(saved);
    else setPanelMode('mid');
  } catch (e) { setPanelMode('mid'); }
  $('aboutBtn').onclick = function () { $('aboutModal').hidden = false; };
  $('aboutClose').onclick = function () { $('aboutModal').hidden = true; };
  $('aboutModal').onclick = function (e) { if (e.target === $('aboutModal')) $('aboutModal').hidden = true; };

  window.addEventListener('online', function () {
    state.offline = false;
    if ($('offlineBanner')) $('offlineBanner').hidden = true;
    toast('Back online \u2014 refreshing\u2026');
    var splash = $('splash');
    var failedSplash = splash && !splash.classList.contains('hide');
    if (failedSplash) {
      setTimeout(function () { location.reload(); }, 600);
      return;
    }
    if (state.map) {
      refreshNearby().catch(function () {});
    }
  });
  window.addEventListener('offline', function () {
    state.offline = true;
    if ($('offlineBanner')) $('offlineBanner').hidden = false;
    toast('No signal');
  });

  applyTheme();
  initMap();
  loadData()
    .then(function () {
      $('splash').classList.add('hide');
      toast((state.static && state.static.length ? state.static.length.toLocaleString() + ' toilets ready' : 'Ready'));
      if (navigator.geolocation) locate();
      else refreshNearby();
    })
    .catch(function (err) {
      var fe = friendlyError(err);
      $('splash').innerHTML =
        '<div style="font-size:2.5rem">\ud83d\udce1</div>' +
        '<h1 style="font-size:1.2rem;margin-top:12px">' + fe.title + '</h1>' +
        '<p style="color:var(--muted);max-width:280px;text-align:center;margin-top:8px;line-height:1.45">' + fe.body + '</p>' +
        errorActionsHtml('retryBtn');
      var btn = document.getElementById('retryBtn');
      if (btn) btn.onclick = function () { location.reload(); };
    });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();
