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
    return 'g2g_c3_' + lat.toFixed(2) + '_' + lng.toFixed(2) + '_' + rad;
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
      state.all = (cached.list || []).filter(function (t) {
        return !(typeof isNameJunk === 'function' && isNameJunk(t.n)) && !(typeof isBlockedId === 'function' && isBlockedId(t.i));
      });
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

    var nearKm = Math.min(1, state.radiusKm);
    var fullKm = Math.max(state.radiusKm, 2);
    var uk = inUK(lat, lng);
    var pending = 1 + (fullKm > nearKm ? 1 : 0) + (uk ? 1 : 0);
    var bags = [];

    function ingest(list) {
      bags.push(list || []);
      var merged = mergeToilets(bags);
      merged = merged.filter(function (t) {
        return !(typeof isNameJunk === 'function' && isNameJunk(t.n)) && !(typeof isBlockedId === 'function' && isBlockedId(t.i));
      });
      state.all = merged;
      writeCache(lat, lng, state.radiusKm, merged);
      applyList();
    }

    function doneOne() {
      pending--;
      if (pending <= 0) {
        state.loading = false;
        if (!state.all.length) applyList();
      }
    }

    // Progressive: nearest 1 km first for instant pins
    fetchOverpass(lat, lng, nearKm * 1000).then(function (list) {
      ingest(list);
      doneOne();
    }).catch(function () { doneOne(); });

    if (fullKm > nearKm) {
      fetchOverpass(lat, lng, fullKm * 1000).then(function (list) {
        ingest(list);
        doneOne();
      }).catch(function () { doneOne(); });
    }

    if (uk) {
      fetchUkToiletMap(lat, lng, Math.max(fullKm, 5)).then(function (list) {
        ingest(list);
        doneOne();
      }).catch(function () { doneOne(); });
    }
  }

  function showListLoading() {
    var el = $('list');
    var meta = $('meta');
    if (meta) meta.textContent = 'Loading nearby toilets\u2026';
    if (el) el.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udebd</div><h3>Finding toilets</h3><p>Checking closest first\u2026</p></div>';
  }

  function displayDist(t) {
    if (t.userDist != null) return t.userDist;
    return t.dist;
  }

  function applyList() {
    var originLat = state.focusLat, originLng = state.focusLng;
    var max = state.radiusKm * 1000;
    var scored = (state.all || []).map(function (t) {
      var o = Object.assign({}, t);
      o.dist = haversine(originLat, originLng, t.lat, t.lng);
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
    scored = scored.filter(function (t) {
      if (typeof isNameJunk === 'function' && isNameJunk(t.n)) return false;
      if (typeof isBlockedId === 'function' && isBlockedId(t.i)) return false;
      return passFilter(t);
    });
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
      if (t.chain) badges += '<span class="badge info">Customer toilet</span>';
