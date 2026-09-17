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

  // boot
  initMap();
  wire();
  setTimeout(hideSplash, 600);
  locateUser(false);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();
