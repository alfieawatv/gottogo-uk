      i: 'osm-' + el.type + '-' + el.id,
      n: censor(osmName(tags)),
      lat: lat,
      lng: lng,
      a: !!accessible,
      b: !!baby,
      r: tags.centralkey === 'radar' || tags.radar === 'yes',
      g: !!gender,
      free: !!free,
      fee: !!fee,
      notes: censor(noteParts.join(' \u00b7 ')),
      hours: null,
      open: null,
      area: tags['addr:city'] || tags['addr:town'] || '',
      src: 'osm',
      osmAmenity: tags.amenity || 'toilets'
    };
  }

  async function fetchOverpass(lat, lng, radiusM) {
    radiusM = Math.min(Math.max(radiusM, 500), 25000);
    var q = '[out:json][timeout:30];\n(\n'
      + '  node["amenity"="toilets"](around:' + radiusM + ',' + lat + ',' + lng + ');\n'
      + '  way["amenity"="toilets"](around:' + radiusM + ',' + lat + ',' + lng + ');\n'
      + '  node["toilets"="yes"]["amenity"~"^(pub|bar|restaurant|cafe|fast_food|hotel|fuel|biergarten)$"](around:' + radiusM + ',' + lat + ',' + lng + ');\n'
      + ');\nout center tags;';
    var lastErr;
    for (var i = 0; i < OVERPASS_URLS.length; i++) {
      try {
        var res = await fetch(OVERPASS_URLS[i], {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var list = (data.elements || []).map(normalizeOsm).filter(Boolean);
        return list;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Overpass failed');
  }

  function normalizeUk(raw) {
    if (!raw || !raw.location) return null;
    var open = isOpenNow(raw.openingTimes);
    return {
      i: 'uk-' + raw.id,
      n: censor(raw.name || 'Public toilet'),
      lat: raw.location.lat,
      lng: raw.location.lng,
      a: !!raw.accessible,
      b: !!raw.babyChange,
      r: !!raw.radar,
      g: !!raw.allGender,
      free: raw.noPayment !== false && !raw.paymentDetails,
      fee: !!raw.paymentDetails,
      notes: censor(raw.notes || ''),
      hours: formatHours(raw.openingTimes),
      open: open,
      area: (raw.area && raw.area.name) || '',
      src: 'toiletmap',
      pay: raw.paymentDetails || ''
    };
  }

  async function fetchUkToiletMap(lat, lng, radiusKm) {
    try {
      var res = await fetch(GQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: PROXIMITY_QUERY,
          variables: { from: { lat: lat, lng: lng, maxDistance: Math.round(radiusKm * 1000) } }
        })
      });
      if (!res.ok) return [];
      var data = await res.json();
      var loos = (data.data && data.data.loosByProximity) || [];
      return loos.map(normalizeUk).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function mergeToilets(lists) {
    var out = [];
    var seen = new Map();
    lists.forEach(function (list) {
      (list || []).forEach(function (t) {
        var key = t.lat.toFixed(4) + ',' + t.lng.toFixed(4);
        if (seen.has(key)) {
          var prev = seen.get(key);
          if (t.src === 'toiletmap' && prev.src === 'osm') {
            var idx = out.indexOf(prev);
            if (idx >= 0) out[idx] = t;
            seen.set(key, t);
          }
          return;
        }
        seen.set(key, t);
        out.push(t);
      });
    });
    return out;
  }

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

  function renderMarkers(list) {
    state.cluster.clearLayers();
    state.markers.clear();
    list.forEach(function (t) {
      var m = L.marker([t.lat, t.lng], { icon: pinIcon(state.selected === t.i) });
      m.bindPopup('<strong>' + esc(t.n) + '</strong><br>' + formatDist(displayDist(t)) +
        (t.src === 'osm' ? '<br><span style="opacity:.7;font-size:11px">OpenStreetMap</span>' : ''));
      m.on('click', function () { selectToilet(t); });
      state.cluster.addLayer(m);
      state.markers.set(t.i, m);
    });
  }

  function displayDist(t) {
    if (t.userDist != null && !isNaN(t.userDist)) return t.userDist;
    return t.dist;
  }

