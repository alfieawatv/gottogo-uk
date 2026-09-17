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
