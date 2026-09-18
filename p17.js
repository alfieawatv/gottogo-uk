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
