  /* ---------- Load nearby ---------- */
  async function refreshNearby() {
    if (state.focusLat == null || state.focusLng == null) return;
    state.loading = true;
    showListLoading();
    var lat = state.focusLat, lng = state.focusLng;
    var radiusM = state.radiusKm * 1000;
    try {
      var tasks = [fetchOverpass(lat, lng, radiusM)];
      if (inUK(lat, lng)) tasks.push(fetchUkToiletMap(lat, lng, state.radiusKm));
      var results = await Promise.all(tasks);
      var merged = mergeToilets(results);
      state.all = merged;
      applyList();
      if (!merged.length) {
        toast('No toilets found here — try a larger radius or another area');
      }
    } catch (e) {
      console.error(e);
      showListError(e);
    } finally {
      state.loading = false;
    }
  }

  function showListLoading() {
    var list = $('list');
    if (!list) return;
    list.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    if ($('meta')) $('meta').textContent = 'Loading toilets\u2026';
  }

  function showListError(e) {
    var list = $('list');
    if (!list) return;
    var msg = !navigator.onLine ? 'No connection — check Wi\u2011Fi or mobile data' : 'Could not load toilets (map data busy). Try again.';
    list.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udccd</div><h3>Couldn\u2019t load data</h3><p>' + esc(msg) + '</p>' +
      '<button type="button" class="btn primary" id="retryBtn">Try again</button></div>';
    var rb = $('retryBtn');
    if (rb) rb.onclick = function () { refreshNearby(); };
    if ($('meta')) $('meta').textContent = 'Error';
  }

  function applyList() {
    var lat = state.focusLat, lng = state.focusLng;
    var max = state.radiusKm * 1000;
    var list = state.all.map(function (t) {
