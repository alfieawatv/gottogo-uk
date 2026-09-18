      var o = Object.assign({}, t);
      o.dist = haversine(lat, lng, t.lat, t.lng);
      if (state.userLat != null) o.userDist = haversine(state.userLat, state.userLng, t.lat, t.lng);
      else o.userDist = null;
      return o;
    }).filter(function (t) { return t.dist <= max; });

    var f = state.filter;
    if (f === 'accessible') list = list.filter(function (t) { return t.a; });
    else if (f === 'free') list = list.filter(function (t) { return t.free; });
    else if (f === 'baby') list = list.filter(function (t) { return t.b; });
    else if (f === 'radar') list = list.filter(function (t) { return t.r; });
    else if (f === 'gender') list = list.filter(function (t) { return t.g; });
    else if (f === 'open') list = list.filter(function (t) { return t.open === true; });
    else if (f === 'fav') list = list.filter(function (t) { return state.favs[t.i]; });

    list.sort(function (a, b) { return a.dist - b.dist; });
    state.nearby = list;
    renderMarkers(list);
    renderList(list);
  }

  function renderList(list) {
    var el = $('list');
    var meta = $('meta');
    if (!el) return;
    var where = state.searchLock ? 'near search' : (state.userLat != null ? 'near you' : 'in this area');
    var radLabel = state.units === 'imperial'
      ? (state.radiusKm * 0.621371).toFixed(1) + ' mi'
      : state.radiusKm + ' km';
    if (meta) meta.textContent = list.length + ' within ' + radLabel + ' ' + where;

    if (!list.length) {
      el.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udebd</div><h3>No matches within ' + radLabel + '</h3>' +
        '<p>Try a larger radius, clear filters, or Search this area.</p></div>';
      return;
    }
    el.innerHTML = list.map(function (t) {
      var badges = '';
