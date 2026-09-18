      var data = await res.json();
      var loos = (data.data && data.data.loosByProximity) || [];
      return loos.map(normalizeUk).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function nearKey(lat, lng) {
    return lat.toFixed(4) + ',' + lng.toFixed(4);
  }
  function findNearDuplicate(out, t) {
    var key = nearKey(t.lat, t.lng);
    for (var i = 0; i < out.length; i++) {
      var p = out[i];
      if (nearKey(p.lat, p.lng) === key) return i;
      if (Math.abs(p.lat - t.lat) < 0.00035 && Math.abs(p.lng - t.lng) < 0.00035) return i;
    }
    return -1;
  }
  function preferToilet(a, b) {
    if (a.src === 'toiletmap' && b.src === 'osm') return a;
    if (b.src === 'toiletmap' && a.src === 'osm') return b;
    if (a.src === b.src) {
      if (a.n && a.n !== 'Public toilet' && (!b.n || b.n === 'Public toilet')) return a;
      if (b.n && b.n !== 'Public toilet' && (!a.n || a.n === 'Public toilet')) return b;
    }
    return a;
  }
  function mergeToilets(lists) {
    var out = [];
    (lists || []).forEach(function (list) {
      (list || []).forEach(function (t) {
        if (!t || t.lat == null || t.lng == null) return;
        var idx = findNearDuplicate(out, t);
        if (idx >= 0) { out[idx] = preferToilet(out[idx], t); return; }
        out.push(t);
      });
    });
    return out;
  }

  function cacheKey(lat, lng, rad) {
    return 'g2g_c_' + lat.toFixed(3) + '_' + lng.toFixed(3) + '_' + rad;
  }
  function readCache(lat, lng, rad) {
    try {
      var o = JSON.parse(sessionStorage.getItem(cacheKey(lat, lng, rad)) || 'null');
      if (!o || !o.t || Date.now() - o.t > 300000) return null;
      return o.list || null;
    } catch (e) { return null; }
  }
  function writeCache(lat, lng, rad, list) {
    try {
      sessionStorage.setItem(cacheKey(lat, lng, rad), JSON.stringify({ t: Date.now(), list: list }));
    } catch (e) {}
  }

  async function refreshNearby() {
    if (state.focusLat == null || state.focusLng == null) return;
    var lat = state.focusLat, lng = state.focusLng;
    var cached = readCache(lat, lng, state.radiusKm);
    if (cached && cached.length) {
      state.all = cached;
      applyList();
    } else {
      state.loading = true;
      showListLoading();
      state.all = [];
    }
    var pending = inUK(lat, lng) ? 2 : 1;
    function done() {
      pending--;
      if (pending <= 0) {
        state.loading = false;
        writeCache(lat, lng, state.radiusKm, state.all);
        if (!state.all.length) toast('No toilets found here — try a larger radius');
      }
    }
    function ingest(list) {
      if (!list || !list.length) return;
      state.all = mergeToilets([state.all || [], list]);
      applyList();
    }
    fetchOverpass(lat, lng, state.radiusKm * 1000).then(function (list) {
      ingest(list);
      done();
    }).catch(function (e) {
      console.error(e);
      done();
      if (!state.all.length) showListError(e);
    });
    if (inUK(lat, lng)) {
      fetchUkToiletMap(lat, lng, state.radiusKm).then(function (list) {
        ingest(list);
        done();
      }).catch(function () { done(); });
    }
  }

  function showListLoading() {
    var list = $('list');
    if (!list) return;
    list.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    if ($('meta')) $('meta').textContent = 'Loading toilets\u2026';
  }

  function showListError(e) {
    var list = $('list');
    if (!list) return;
    var msg = !navigator.onLine ? 'No connection — check Wi\u2011Fi or mobile data' : 'Could not load toilets (map data busy). Try again.';
    list.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udccd</div><h3>Couldn\u2019t load data</h3><p>' + esc(msg) + '</p>' +
      '<button type="button" class="btn primary" id="retryBtn">Try again</button></div>';
    var rb = $('retryBtn');
    if (rb) rb.onclick = function () { refreshNearby(); };
    if ($('meta')) $('meta').textContent = 'Error';
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20, 0], 2);
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

  function displayDist(t) {
    if (t.userDist != null && !isNaN(t.userDist)) return t.userDist;
    return t.dist;
  }

  function renderMarkers(list) {
    state.cluster.clearLayers();
    state.markers.clear();
    list.forEach(function (t) {
      var m = L.marker([t.lat, t.lng], { icon: pinIcon(state.selected === t.i) });
      m.bindPopup('<strong>' + esc(t.n) + '</strong><br>' + formatDist(displayDist(t)) +
        '<br><span style="opacity:.7;font-size:11px">' + (t.src === 'osm' ? 'OpenStreetMap' : 'Toilet Map') + '</span>');
      m.on('click', function () { selectToilet(t); });
      state.cluster.addLayer(m);
      state.markers.set(t.i, m);
    });
  }

  function applyList() {
    var lat = state.focusLat, lng = state.focusLng;
    var max = state.radiusKm * 1000;
    var list = state.all.map(function (t) {
      var o = Object.assign({}, t);
      o.dist = haversine(lat, lng, t.lat, t.lng);
      if (state.userLat != null) o.userDist = haversine(state.userLat, state.userLng, t.lat, t.lng);
      else o.userDist = null;
      return o;
    }).filter(function (t) { return t.dist <= max; });
    var f = state.filter;
    if (f === 'accessible') list = list.filter(function (t) { return t.a; });
    else if (f === 'free') list = list.filter(function (t) { return t.free; });
    else if (f === 'baby') list = list.filter(function (t) { return t.b; });
    else if (f === 'radar') list = list.filter(function (t) { return t.r; });
    else if (f === 'gender') list = list.filter(function (t) { return t.g; });
    else if (f === 'open') list = list.filter(function (t) { return t.open === true; });
    else if (f === 'fav') list = list.filter(function (t) { return state.favs[t.i]; });
    list.sort(function (a, b) { return a.dist - b.dist; });
    state.nearby = list;
    renderMarkers(list);
    renderList(list);
  }

  function renderList(list) {
    var el = $('list');
    var meta = $('meta');
    if (!el) return;
    var where = state.searchLock ? 'near search' : (state.userLat != null ? 'near you' : 'in this area');
    var radLabel = state.units === 'imperial'
      ? (state.radiusKm * 0.621371).toFixed(1) + ' mi'
      : state.radiusKm + ' km';
    if (meta) meta.textContent = list.length + ' within ' + radLabel + ' ' + where;
    if (!list.length) {
      el.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udebd</div><h3>No matches within ' + radLabel + '</h3><p>Try a larger radius or Search this area.</p></div>';
      return;
    }
    el.innerHTML = list.map(function (t) {
      var badges = '';
      if (t.open === true) badges += '<span class="badge open">Open</span>';
      if (t.open === false) badges += '<span class="badge closed">Closed</span>';
      if (t.a) badges += '<span class="badge ok">Accessible</span>';
      if (t.free) badges += '<span class="badge ok">Free</span>';
      if (t.fee) badges += '<span class="badge fee">Fee</span>';
      if (t.b) badges += '<span class="badge info">Baby</span>';
      if (t.r) badges += '<span class="badge info">RADAR</span>';
