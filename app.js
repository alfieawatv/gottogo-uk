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
  var STATIC_URL = 'https://p02w6qqjlqmja4sk.public.blob.vercel-storage.com/exports/toilets-2026-09-16T00%3A00%3A40.869Z-vRPZ3vhRc0EJZy4t6bv7JOCAOqx8UX.json';
  var STATIC_FALLBACK = './toilets.json';
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

  function walkMins(m) {
    if (m == null) return '';
    return '~' + Math.max(1, Math.round(m / 83.3)) + ' min walk';
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

  async function loadStatic() {
    setSplashStatus('Loading UK toilet dataset\u2026');
    showSplashSpinner();
    var urls = [STATIC_URL];
    if (typeof STATIC_FALLBACK !== 'undefined' && STATIC_FALLBACK) urls.push(STATIC_FALLBACK);
    var list = null, lastErr = null;
    for (var u = 0; u < urls.length; u++) {
      try {
        setSplashStatus(u === 0 ? 'Loading toilet data\u2026' : 'Trying backup source\u2026');
        var res = await fetch(urls[u], { cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var raw = await res.json();
        if (!Array.isArray(raw) || !raw.length) throw new Error('Empty dataset');
        list = [];
        for (var i = 0; i < raw.length; i++) {
          var n = normalizeRawToilet(raw[i]);
          if (n) list.push(n);
        }
        if (list.length) break;
      } catch (e) {
        lastErr = e;
        console.warn('Static load failed', urls[u], e);
      }
    }
    if (!list || !list.length) throw lastErr || new Error('Could not load toilet dataset');
    state.static = list;
    staticLoaded = true;
    state.all = list;
    saveJson(LS_CACHE, { at: Date.now(), n: list.length });
    $('meta').textContent = list.length.toLocaleString() + ' UK toilets loaded';
    return list;
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
      var source = state.static && state.static.length ? state.static : state.all;
      if (!source || !source.length) {
        if (!staticLoaded) await loadStatic();
        source = state.static;
      }
      var items = [];
      for (var i = 0; i < source.length; i++) {
        var t = source[i];
        var d = haversine(lat, lng, t.lat, t.lng);
        if (d <= max) {
          items.push({
            i: t.i, n: t.n, a: t.a, lat: t.lat, lng: t.lng,
            w: t.w, f: t.f, b: t.b, r: t.r, g: t.g,
            note: t.note || null, pay: t.pay || null,
            ot: t.ot || null, open: t.open, hours: t.hours,
            dist: d
          });
        }
      }
      items.sort(function (a, b) { return a.dist - b.dist; });
      state.all = items;
      state.offline = false;
      if ($('offlineBanner')) $('offlineBanner').hidden = true;
      applyList();
    } catch (e) {
      console.warn(e);
      $('meta').textContent = 'Could not filter toilets';
      $('list').innerHTML = '<div class="empty"><div class="emoji">\ud83d\udce1</div><h3>Couldn\u2019t load toilets</h3><p>Try refreshing the page.</p><button class="btn primary" style="margin-top:14px;max-width:200px;margin-left:auto;margin-right:auto" id="listRetry">Try again</button></div>';
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
    var where = (state.focusLat != null && state.userLat != null && Math.abs(state.focusLat - state.userLat) < 1e-8) ? 'of you' : (state.focusLat != null ? 'of search' : 'of map centre');
    $('meta').textContent = n ? (n + ' within ' + state.radiusKm + ' km ' + where) : ('No matches within ' + state.radiusKm + ' km');

    if (!n) {
      el.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udd0d</div><h3>Nothing nearby</h3><p>Try a larger radius, clear filters,<br/>or search a town / postcode.</p><button class="btn primary" style="margin-top:14px;max-width:200px;margin-left:auto;margin-right:auto" id="emptyRadius">Set radius 10 km</button></div>';
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
        '<div class="card-dist">' + formatDist(t.dist) + '<div class="card-walk">' + walkMins(t.dist) + '</div></div></div>';
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
      m.bindPopup('<strong>' + esc(t.n) + '</strong><br/><span style="color:#94a3b8;font-size:12px">' + esc(t.a || '') + '</span><br/><span style="color:#2dd4bf;font-weight:600">' + formatDist(t.dist) + '</span>');
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
      '<div class="sub">' + (t.a ? esc(t.a) + ' \u00b7 ' : '') + formatDist(t.dist) + ' \u00b7 ' + walkMins(t.dist) + '</div>' +
      '<div class="actions">' +
        '<a class="btn primary" href="' + maps + '" target="_blank" rel="noopener">Directions</a>' +
        '<button class="btn' + (isFav ? ' fav-on' : '') + '" type="button" id="favBtn">' + (isFav ? '\u2605 Saved' : '\u2606 Save') + '</button>' +
        '<button class="btn" type="button" id="shareBtn">Share</button>' +
      '</div>' +
      '<div class="tags">' + badges.join('') + '</div>' +
      '<div class="grid">' +
        '<div class="stat"><div class="stat-l">Distance</div><div class="stat-v">' + (formatDist(t.dist) || '\u2014') + '</div></div>' +
        '<div class="stat"><div class="stat-l">Walk</div><div class="stat-v">' + walkMins(t.dist) + '</div></div>' +
        (t.hours ? '<div class="stat" style="grid-column:1/-1"><div class="stat-l">Hours today</div><div class="stat-v">' + esc(t.hours) + '</div></div>' : '') +
        (t.pay ? '<div class="stat" style="grid-column:1/-1"><div class="stat-l">Payment</div><div class="stat-v">' + esc(t.pay) + '</div></div>' : '') +
      '</div>' +
      (t.note ? '<div class="note">' + esc(t.note) + '</div>' : '') +
      '<div class="rate"><span style="font-size:.85rem;color:var(--muted)">Your rating:</span>' +
        [1,2,3,4,5].map(function (n) {
          return '<button type="button" data-r="' + n + '" class="' + (myRate >= n ? 'on' : '') + '">\u2605</button>';
        }).join('') + '</div>' +
      '<a class="btn" href="' + tm + '" target="_blank" rel="noopener" style="margin-bottom:8px">View / report on Toilet Map</a>' +
      '<div class="credit">Contains data from the <a href="https://www.toiletmap.org.uk/dataset" target="_blank" rel="noopener">Toilet Map</a> \u00a9 Public Convenience Ltd \u2014 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Location stays on your device.</div>';
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

  async function searchPlace(q) {
    if (!q || q.length < 2) return;
    toast('Searching\u2026');
    state.searchLock = true;
    try {
      var url = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=' + encodeURIComponent(q) + '&limit=1';
      var res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GotToGo/3.0' } });
      var data = await res.json();
      if (!data.length) { toast('No place found in the UK'); return; }
      var lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
      state.focusLat = lat;
      state.focusLng = lng;
      state.map.setView([lat, lng], 13);
      if (state.radiusKm < 8) { $('radius').value = '10'; state.radiusKm = 10; localStorage.setItem(LS_RAD, '10'); }
      await refreshNearby();
      var btn = $('searchAreaBtn');
      if (btn) btn.hidden = true;
      toast(data[0].display_name.split(',').slice(0, 2).join(','));
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
    if (e.key === 'Enter') { e.preventDefault(); searchPlace(searchInput.value.trim()); }
  });
  searchInput.addEventListener('input', function () {
    $('searchBox').classList.toggle('has-value', searchInput.value.length > 0);
  });
  $('searchClear').onclick = function () {
    searchInput.value = '';
    $('searchBox').classList.remove('has-value');
    searchInput.focus();
  };
  $('expandBtn').onclick = function () {
    var p = $('panel');
    p.classList.toggle('expanded');
    $('expandBtn').textContent = p.classList.contains('expanded') ? 'Collapse' : 'Expand';
  };
  $('handle').onclick = function () { $('expandBtn').click(); };
  $('aboutBtn').onclick = function () { $('aboutModal').hidden = false; };
  $('aboutClose').onclick = function () { $('aboutModal').hidden = true; };
  $('aboutModal').onclick = function (e) { if (e.target === $('aboutModal')) $('aboutModal').hidden = true; };

  window.addEventListener('online', function () {
    state.offline = false;
    if ($('offlineBanner')) $('offlineBanner').hidden = true;
    toast('Back online');
  });
  window.addEventListener('offline', function () {
    state.offline = true;
    if ($('offlineBanner')) $('offlineBanner').hidden = false;
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
      $('splash').innerHTML =
        '<div style="font-size:2.5rem">\ud83d\udce1</div>' +
        '<h1 style="font-size:1.2rem;margin-top:12px">Couldn\u2019t load data</h1>' +
        '<p style="color:var(--muted);max-width:280px;text-align:center;margin-top:8px;line-height:1.45">' +
        'Could not download the toilet dataset. Check your connection and try again.</p>' +
        '<p style="color:var(--muted);font-size:.75rem;margin-top:6px">' + esc(err && err.message ? err.message : 'Failed to fetch') + '</p>' +
        '<button class="btn primary" style="margin-top:16px;width:100%;max-width:220px;box-sizing:border-box" id="retryBtn">Try again</button>';
      var btn = document.getElementById('retryBtn');
      if (btn) btn.onclick = function () { location.reload(); };
    });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();
