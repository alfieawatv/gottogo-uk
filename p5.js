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
        if (idx >= 0) {
          out[idx] = preferToilet(out[idx], t);
          return;
        }
        out.push(t);
      });
    });
    return out;
  }

  /* ---------- Map ---------- */
  function initMap() {
    state.map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> \u00b7 Toilets from OSM + Toilet Map',
      maxZoom: 19
    }).addTo(state.map);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    state.cluster = L.markerClusterGroup({
      maxClusterRadius: 48, spiderfyOnMaxZoom: true,
      showCoverageOnHover: false, disableClusteringAtZoom: 16
