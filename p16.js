    var t = localStorage.getItem(LS_THEME) || 'dark';
    document.body.classList.toggle('light', t === 'light');
  }

  /* ---------- Wire UI ---------- */
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
        state.radiusKm = parseFloat($('radius').value) || 5;
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
