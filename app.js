(function () {
  var LS_FAV = 'g2g_favs';
  var LS_RATE = 'g2g_rates';
  var LS_FILT = 'g2g_filter';
  var LS_RAD = 'g2g_radius';
  var LS_THEME = 'g2g_theme';
  var LS_CACHE = 'g2g_cache';

  var state = {
    all: [], nearby: [], filter: localStorage.getItem(LS_FILT) || 'all',
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
    if (slot && slot[0] && slot[1]) return days[day] + ' ' + slot[0] + '–' + slot[1];
    return null;
  }

  function mapToilet(t, refLat, refLng) {
    var lat = t.location && t.location.lat;
    var lng = t.location && t.location.lng;
    if (lat == null || lng == null) return null;
    var area = Array.isArray(t.area) && t.area[0] ? t.area[0].name : '';
    var open = isOpenNow(t.openingTimes);
    return {
      i: t.id,
      n: (t.name && String(t.name).trim()) || 'Public Toilet',
      a: area || '',
      lat: +lat, lng: +lng,
      w: t.accessible === true ? 1 : 0,
      f: t.noPayment === true ? 0 : (t.noPayment === false ? 1 : -1),
      b: t.babyChange === true ? 1 : 0,
      r: t.radar === true ? 1 : 0,
      g: t.allGender === true ? 1 : 0,
      note: t.notes || null,
      pay: t.paymentDetails || null,
      ot: t.openingTimes || null,
      open: open,
      hours: formatHours(t.openingTimes),
      dist: haversine(refLat, refLng, +lat, +lng)
    };
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
      html: '<div class="pin' + (selected ? ' selected' : '') + '"><span>🚽</span></div>',
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

  async function fetchNearby(lat, lng, radiusM) {
    var res = await fetch(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        query: PROXIMITY_QUERY,
        variables: { from: { lat: lat, lng: lng, maxDistance: Math.round(radiusM) } }
      })
    });
    if (!res.ok) throw new Error('Toilet Map API HTTP ' + res.status);
    var json = await res.json();
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'GraphQL error');
    var list = (json.data && json.data.loosByProximity) || [];
    return list.map(function (t) { return mapToilet(t, lat, lng); }).filter(Boolean);
  }

  function showSkeletons() {
    $('list').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  }

  async function loadData() {
    showSkeletons();
    try {
      var items = await fetchNearby(54.5, -2.5, 50000);
      state.all = items;
      saveJson(LS_CACHE, { at: Date.now(), items: items.slice(0, 100), lat: 54.5, lng: -2.5 });
      $('meta').textContent = 'Ready · Toilet Map live data';
    } catch (e) {
      var cache = loadJson(LS_CACHE, null);
      if (cache && cache.items && cache.items.length) {
        state.all = cache.items;
        state.offline = true;
        $('offlineBanner').hidden = false;
        $('meta').textContent = 'Cached results';
        toast('Using cached toilets');
      } else throw e;
    }
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
    $('meta').textContent = 'Loading nearby…';
    showSkeletons();
    try {
      var items = await fetchNearby(lat, lng, max);
      state.all = items;
      state.offline = false;
      $('offlineBanner').hidden = true;
      saveJson(LS_CACHE, { at: Date.now(), items: items.slice(0, 150), lat: lat, lng: lng });
      applyList();
    } catch (e) {
      console.warn(e);
      var cache = loadJson(LS_CACHE, null);
      if (cache && cache.items && cache.items.length) {
        state.all = cache.items.map(function (t) {
          t.dist = haversine(lat, lng, t.lat, t.lng);
          return t;
        });
        state.offline = true;
        $('offlineBanner').hidden = false;
        applyList();
        toast('Offline — cached results');
      } else {
        toast('Could not load toilets nearby');
        $('meta').textContent = 'Failed to load — try again';
        $('list').innerHTML = '<div class="empty"><div class="emoji">📡</div><h3>Couldn’t load toilets</h3><p>Check your connection and try again.</p></div>';
      }
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
      el.innerHTML = '<div class="empty"><div class="emoji">🔍</div><h3>Nothing nearby</h3><p>Try a larger radius, clear filters,<br/>or search a town / postcode.</p><button class="btn primary" style="margin-top:14px;max-width:200px;margin-left:auto;margin-right:auto" id="emptyRadius">Set radius 10 km</button></div>';
      var b = document.getElementById('emptyRadius');
      if (b) b.onclick = function () { $('radius').value = '10'; state.radiusKm = 10; localStorage.setItem(LS_RAD, '10'); refreshNearby(); };
      return;
    }

    el.innerHTML = state.nearby.map(function (t) {
      var badges = [];
      if (t.open === true) badges.push('<span class="badge open">Open</span>');
      if (t.open === false) badges.push('<span class="badge closed">Closed</span>');
      if (t.w) badges.push('<span class="badge ok">♿</span>');
      if (t.f === 0) badges.push('<span class="badge">Free</span>');
      if (t.f === 1) badges.push('<span class="badge fee">Fee</span>');
      if (t.b) badges.push('<span class="badge">Baby</span>');
      if (t.r) badges.push('<span class="badge info">RADAR</span>');
      if (state.favs[t.i]) badges.push('<span class="badge fee">★</span>');
      return '<div class="card' + (state.selected === t.i ? ' active' : '') + '" data-id="' + t.i + '" role="button" tabindex="0">' +
        '<div class="card-icon">🚽</div><div class="card-body">' +
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
    if (t.w) badges.push('<span class="badge ok">♿ Wheelchair accessible</span>');
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
      '<button class="back" id="backBtn">← Back to list</button>' +
      '<h2>' + esc(t.n) + '</h2>' +
      '<div class="sub">' + (t.a ? esc(t.a) + ' · ' : '') + formatDist(t.dist) + ' · ' + walkMins(t.dist) + '</div>' +
      '<div class="actions">' +
        '<a class="btn primary" href="' + maps + '" target="_blank" rel="noopener">Directions</a>' +
        '<button class="btn' + (isFav ? ' fav-on' : '') + '" type="button" id="favBtn">' + (isFav ? '★ Saved' : '☆ Save') + '</button>' +
        '<button class="btn" type="button" id="shareBtn">Share</button>' +
      '</div>' +
      '<div class="tags">' + badges.join('') + '</div>' +
      '<div class="grid">' +
        '<div class="stat"><div class="stat-l">Distance</div><div class="stat-v">' + (formatDist(t.dist) || '—') + '</div></div>' +
        '<div class="stat"><div class="stat-l">Walk</div><div class="stat-v">' + walkMins(t.dist) + '</div></div>' +
        (t.hours ? '<div class="stat" style="grid-column:1/-1"><div class="stat-l">Hours today</div><div class="stat-v">' + esc(t.hours) + '</div></div>' : '') +
        (t.pay ? '<div class="stat" style="grid-column:1/-1"><div class="stat-l">Payment</div><div class="stat-v">' + esc(t.pay) + '</div></div>' : '') +
      '</div>' +
      (t.note ? '<div class="note">' + esc(t.note) + '</div>' : '') +
      '<div class="rate"><span style="font-size:.85rem;color:var(--muted)">Your rating:</span>' +
        [1,2,3,4,5].map(function (n) {
          return '<button type="button" data-r="' + n + '" class="' + (myRate >= n ? 'on' : '') + '">★</button>';
        }).join('') + '</div>' +
      '<a class="btn" href="' + tm + '" target="_blank" rel="noopener" style="margin-bottom:8px">View / report on Toilet Map</a>' +
      '<div class="credit">Contains data from the <a href="https://www.toiletmap.org.uk/dataset" target="_blank" rel="noopener">Toilet Map</a> © Public Convenience Ltd — <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Location stays on your device.</div>';
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
      var data = { title: t.n, text: t.n + (t.a ? ' — ' + t.a : ''), url: 'https://www.google.com/maps?q=' + t.lat + ',' + t.lng };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(data.text + '\n' + data.url); toast('Link copied'); }
      } catch (e) {}
    };
    el.querySelectorAll('.rate button').forEach(function (btn) {
      btn.onclick = function () {
        state.rates[t.i] = +btn.dataset.r;
        saveJson(LS_RATE, state.rates);
        toast('Rated ' + btn.dataset.r + '★ (saved on this device)');
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
    toast('Finding your location…');
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
    toast('Searching…');
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
    } catch (e) { toast('Search failed — check connection'); }
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
    $('offlineBanner').hidden = true;
    toast('Back online');
    refreshNearby();
  });
  window.addEventListener('offline', function () {
    state.offline = true;
    $('offlineBanner').hidden = false;
  });

  applyTheme();
  initMap();
  loadData()
    .then(function () {
      $('splash').classList.add('hide');
      toast('Connected to Toilet Map');
      if (navigator.geolocation) locate();
      else refreshNearby();
    })
    .catch(function (err) {
      $('splash').innerHTML =
        '<div style="font-size:2.5rem">📡</div>' +
        '<h1 style="font-size:1.2rem;margin-top:12px">Couldn’t load data</h1>' +
        '<p style="color:var(--muted);max-width:260px;text-align:center;margin-top:8px">' + esc(err.message) + '</p>' +
        '<button class="btn primary" style="margin-top:16px;max-width:200px" id="retryBtn">Try again</button>';
      var btn = document.getElementById('retryBtn');
      if (btn) btn.onclick = function () { location.reload(); };
    });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();
