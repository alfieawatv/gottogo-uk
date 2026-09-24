  function loadCachedPos() {
    try {
      var o = JSON.parse(localStorage.getItem('g2g_lastpos') || 'null');
      if (!o || o.lat == null || o.lng == null || !o.t) return null;
      if (Date.now() - o.t > 24 * 60 * 60 * 1000) return null;
      return o;
    } catch (e) { return null; }
  }
  function savePos(lat, lng) {
    try { localStorage.setItem('g2g_lastpos', JSON.stringify({ lat: lat, lng: lng, t: Date.now() })); } catch (e) {}
  }

  function applyPosition(lat, lng, opts) {
    opts = opts || {};
    state.userLat = lat;
    state.userLng = lng;
    if (!opts.keepSearchLock) state.searchLock = false;
    state.focusLat = lat;
    state.focusLng = lng;
    setUser(lat, lng);
    if (!opts.noMap) state.map.setView([lat, lng], 14);
    savePos(lat, lng);
    if (!opts.noRefresh) refreshNearby();
  }

  function locateUser(force) {
    if (!force) {
      var cached = loadCachedPos();
      if (cached) {
        applyPosition(cached.lat, cached.lng);
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
            if (r.state === 'granted') {
              navigator.geolocation.getCurrentPosition(function (pos) {
                applyPosition(pos.coords.latitude, pos.coords.longitude, { noMap: true });
              }, function () {}, { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 });
            }
          }).catch(function () {});
        }
        return;
      }
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
          if (r.state === 'granted') doGeo(false);
          else {
            goTo(51.5074, -0.1278, 'London');
            toast('Tap locate to use your location');
          }
        }).catch(function () { doGeo(false); });
        return;
      }
    }
    doGeo(!!force);
  }

  function doGeo(showToast) {
    if (!navigator.geolocation) {
      toast('Location not supported');
      if (state.focusLat == null) goTo(51.5074, -0.1278, 'London');
      return;
    }
    state.locating = true;
    if (showToast) toast('Finding you\u2026');
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.locating = false;
      applyPosition(pos.coords.latitude, pos.coords.longitude);
    }, function (err) {
      state.locating = false;
      if (err.code === 1) toast('Location blocked — open Settings to allow it');
      else if (showToast) toast('Could not get location');
      if (state.focusLat == null) goTo(51.5074, -0.1278, 'London');
    }, { enableHighAccuracy: !!showToast, timeout: 12000, maximumAge: showToast ? 0 : 300000 });
  }

  function setPanelMode(mode) {
    var p = $('panel');
    if (!p) return;
    p.classList.remove('expanded', 'collapsed');
    document.body.classList.remove('panel-collapsed', 'panel-expanded', 'panel-mid');
    if (mode === 'expanded') {
      p.classList.add('expanded');
      document.body.classList.add('panel-expanded');
      if ($('expandBtn')) $('expandBtn').textContent = 'Shrink';
    } else if (mode === 'collapsed') {
      p.classList.add('collapsed');
      document.body.classList.add('panel-collapsed');
      if ($('expandBtn')) $('expandBtn').textContent = 'Expand';
    } else {
      document.body.classList.add('panel-mid');
      if ($('expandBtn')) $('expandBtn').textContent = 'Expand';
    }
    try { localStorage.setItem(LS_PANEL, mode); } catch (e) {}
  }
  function cyclePanel() {
    var p = $('panel');
    if (!p) return;
    if (p.classList.contains('collapsed')) setPanelMode('mid');
    else if (p.classList.contains('expanded')) setPanelMode('collapsed');
    else setPanelMode('expanded');
  }

  function applyTheme() {
    var t = localStorage.getItem(LS_THEME) || 'dark';
    document.body.classList.toggle('light', t === 'light');
  }

  function wire() {
    applyTheme();
    if ($('themeBtn')) $('themeBtn').onclick = function () {
      var next = document.body.classList.contains('light') ? 'dark' : 'light';
      localStorage.setItem(LS_THEME, next);
      applyTheme();
    };
    if ($('locateBtn')) $('locateBtn').onclick = function () { locateUser(true); };
    if ($('fabLocate')) $('fabLocate').onclick = function () { locateUser(true); };
    if ($('fabNearest')) $('fabNearest').onclick = function () {
      if (state.nearby[0]) selectToilet(state.nearby[0]);
      else toast('No toilets loaded yet');
    };
    if ($('searchAreaBtn')) $('searchAreaBtn').onclick = searchThisArea;
    if ($('radius')) {
      $('radius').value = String(state.radiusKm);
      $('radius').onchange = function () {
        state.radiusKm = parseFloat($('radius').value) || 2;
        localStorage.setItem(LS_RAD, state.radiusKm);
        refreshNearby();
      };
    }
    document.querySelectorAll('.chip').forEach(function (chip) {
      if (chip.dataset.f === state.filter) chip.classList.add('active');
      else chip.classList.remove('active');
      chip.onclick = function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        state.filter = chip.dataset.f;
        localStorage.setItem(LS_FILT, state.filter);
        applyList();
      };
    });
    if ($('search')) {
      $('search').oninput = function () {
        if ($('searchBox')) $('searchBox').classList.toggle('has-value', !!$('search').value);
        updateSuggest();
      };
      $('search').onkeydown = function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var q = $('search').value.trim();
          if (q) geocodeAndGo(q);
        }
      };
    }
    if ($('searchClear')) $('searchClear').onclick = function () {
      if ($('search')) $('search').value = '';
      if ($('searchBox')) $('searchBox').classList.remove('has-value');
      var box = $('searchSuggest');
      if (box) { box.hidden = true; box.classList.remove('open'); }
    };
    if ($('aboutBtn')) $('aboutBtn').onclick = function () {
      if ($('aboutModal')) $('aboutModal').hidden = false;
    };
    if ($('aboutClose')) $('aboutClose').onclick = function () {
      if ($('aboutModal')) $('aboutModal').hidden = true;
    };
    if ($('aboutModal')) $('aboutModal').onclick = function (e) {
      if (e.target === $('aboutModal')) $('aboutModal').hidden = true;
    };
    if ($('expandBtn')) $('expandBtn').onclick = cyclePanel;
    var handle = $('handle');
    if (handle) {
      var startY = 0, moved = false, startMode = 'mid';
      function modeNow() {
        var p = $('panel');
        if (p.classList.contains('collapsed')) return 'collapsed';
        if (p.classList.contains('expanded')) return 'expanded';
        return 'mid';
      }
      function onStart(y) { startY = y; moved = false; startMode = modeNow(); }
      function onMove(y) { if (Math.abs(y - startY) > 12) moved = true; }
      function onEnd(y) {
        if (!moved) return;
        var dy = y - startY;
        if (dy < -40) {
          if (startMode === 'collapsed') setPanelMode('mid');
          else setPanelMode('expanded');
        } else if (dy > 40) {
          if (startMode === 'expanded') setPanelMode('mid');
          else setPanelMode('collapsed');
        }
      }
      handle.addEventListener('touchstart', function (e) { if (e.touches[0]) onStart(e.touches[0].clientY); }, { passive: true });
      handle.addEventListener('touchmove', function (e) { if (e.touches[0]) onMove(e.touches[0].clientY); }, { passive: true });
      handle.addEventListener('touchend', function (e) {
        var y = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : startY;
        onEnd(y);
      });
      handle.addEventListener('click', function () { if (!moved) cyclePanel(); });
    }
    window.addEventListener('online', function () {
      state.offline = false;
      if ($('offlineBanner')) $('offlineBanner').hidden = true;
      toast('Back online — refreshing');
      refreshNearby();
    });
    window.addEventListener('offline', function () {
      state.offline = true;
      if ($('offlineBanner')) $('offlineBanner').hidden = false;
    });
    var savedPanel = localStorage.getItem(LS_PANEL) || 'mid';
    setPanelMode(savedPanel);
  }

  function hideSplash() {
    var s = $('splash');
    if (s) s.classList.add('hide');
  }

  initMap();
  wire();
  setTimeout(hideSplash, 400);
  locateUser(false);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();
