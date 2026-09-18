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

