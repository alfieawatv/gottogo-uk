      if (t.open === true) badges += '<span class="badge open">Open</span>';
      if (t.open === false) badges += '<span class="badge closed">Closed</span>';
      if (t.a) badges += '<span class="badge ok">Accessible</span>';
      if (t.free) badges += '<span class="badge ok">Free</span>';
      if (t.fee) badges += '<span class="badge fee">Fee</span>';
      if (t.b) badges += '<span class="badge info">Baby</span>';
      if (t.r) badges += '<span class="badge info">RADAR</span>';
      if (t.osmAmenity && t.osmAmenity !== 'toilets') badges += '<span class="badge">' + esc(t.osmAmenity.replace('_', ' ')) + '</span>';
      var dd = displayDist(t);
      return '<div class="card' + (state.selected === t.i ? ' active' : '') + '" data-id="' + esc(t.i) + '">' +
        '<div class="card-icon">\ud83d\udebd</div>' +
        '<div class="card-body"><div class="card-name">' + esc(t.n) + '</div>' +
        '<div class="card-sub">' + badges + '</div></div>' +
        '<div class="card-dist">' + formatDist(dd) + '<div class="card-walk">' + walkMins(dd) + '</div></div></div>';
    }).join('');
    el.querySelectorAll('.card').forEach(function (card) {
      card.onclick = function () {
        var t = state.nearby.find(function (x) { return x.i === card.dataset.id; });
        if (t) selectToilet(t);
      };
    });
  }

  function selectToilet(t) {
    state.selected = t.i;
    state.markers.forEach(function (m, id) {
      m.setIcon(pinIcon(id === t.i));
    });
    showDetail(t);
    applyList();
  }

  function showDetail(t) {
    var d = $('detail');
    if (!d) return;
    var dd = displayDist(t);
    var favOn = !!state.favs[t.i];
    var tags = '';
    if (t.a) tags += '<span class="badge ok">Accessible</span>';
