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
    return 'g2g_c_' + lat.toFixed(2) + '_' + lng.toFixed(2) + '_' + rad;
  }
  function readCache(lat, lng, rad) {
    try {
      var keys = [cacheKey(lat, lng, rad)];
      var d = 0.02;
      keys.push(cacheKey(lat + d, lng, rad));
      keys.push(cacheKey(lat - d, lng, rad));
      keys.push(cacheKey(lat, lng + d, rad));
      keys.push(cacheKey(lat, lng - d, rad));
      var best = null;
      for (var i = 0; i < keys.length; i++) {
        var raw = localStorage.getItem(keys[i]) || sessionStorage.getItem(keys[i]);
        if (!raw) continue;
        var o = JSON.parse(raw);
        if (!o || !o.t || !o.list || !o.list.length) continue;
        if (Date.now() - o.t > 2 * 60 * 60 * 1000) continue;
        if (!best || o.t > best.t) best = o;
      }
      return best;
    } catch (e) { return null; }
  }
  function writeCache(lat, lng, rad, list) {
    try {
      var payload = JSON.stringify({ t: Date.now(), list: list, lat: lat, lng: lng });
      var k = cacheKey(lat, lng, rad);
      sessionStorage.setItem(k, payload);
      localStorage.setItem(k, payload);
    } catch (e) {}
  }

  async function refreshNearby() {
    if (state.focusLat == null || state.focusLng == null) return;
    var lat = state.focusLat, lng = state.focusLng;
    var cached = readCache(lat, lng, state.radiusKm);
    var haveCache = cached && cached.list && cached.list.length;
    if (haveCache) {
      state.all = cached.list;
      applyList();
      if (Date.now() - cached.t < 10 * 60 * 1000) {
        state.loading = false;
        return;
      }
      state.loading = false;
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
        if (state.all && state.all.length) writeCache(lat, lng, state.radiusKm, state.all);
        if (!state.all.length && !haveCache) toast('No toilets found here — try a larger radius');
      }
    }
    function ingest(list) {
      if (!list || !list.length) return;
      state.all = mergeToilets([state.all || [], list]);
      applyList();
    }
    fetchOverpass(lat, lng, Math.max(state.radiusKm, 20) * 1000).then(function (list) {
      if (list && list.length) {
        if (!haveCache) state.all = list;
        else state.all = mergeToilets([list, state.all || []]);
        applyList();
      }
      done();
    }).catch(function (e) {
      console.error(e);
      done();
      if (!state.all.length) showListError(e);
    });
    if (inUK(lat, lng)) {
      fetchUkToiletMap(lat, lng, Math.max(state.radiusKm, 20)).then(function (list) {
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
    var scored = (state.all || []).map(function (t) {
      var o = Object.assign({}, t);
      o.dist = haversine(lat, lng, t.lat, t.lng);
      if (state.userLat != null) o.userDist = haversine(state.userLat, state.userLng, t.lat, t.lng);
      else o.userDist = null;
      return o;
    });
    function passFilter(t) {
      var f = state.filter;
      if (f === 'accessible') return !!t.a;
      if (f === 'free') return !!t.free;
      if (f === 'baby') return !!t.b;
      if (f === 'radar') return !!t.r;
      if (f === 'gender') return !!t.g;
      if (f === 'open') return t.open === true;
      if (f === 'fav') return !!state.favs[t.i];
      return true;
    }
    scored = scored.filter(passFilter);
    scored.sort(function (a, b) { return a.dist - b.dist; });
    var within = scored.filter(function (t) { return t.dist <= max; });
    var list = within;
    state.closestPad = false;
    if (list.length < 5 && scored.length > list.length) {
      list = scored.slice(0, 5);
      state.closestPad = true;
    }
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
    if (meta) {
      if (state.closestPad) meta.textContent = 'Closest ' + list.length + ' ' + where + ' (beyond ' + radLabel + ')';
      else meta.textContent = list.length + ' within ' + radLabel + ' ' + where;
    }
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
