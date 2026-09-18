      state.searchLock = false;
      state.focusLat = state.userLat;
      state.focusLng = state.userLng;
      setUser(state.userLat, state.userLng);
      state.map.setView([state.userLat, state.userLng], 14);
      refreshNearby();
    }, function (err) {
      state.locating = false;
      if (err.code === 1) toast('Location blocked — open Settings to allow it');
      else toast('Could not get location');
      if (state.focusLat == null) {
        // Default: London so first paint works, user can search worldwide
        goTo(51.5074, -0.1278, 'London');
      }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: force ? 0 : 60000 });
  }

  /* ---------- Panel ---------- */
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
