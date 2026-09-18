      if (t.g) badges += '<span class="badge info">All-gender</span>';
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
    state.markers.forEach(function (m, id) { m.setIcon(pinIcon(id === t.i)); });
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
    if (t.free) tags += '<span class="badge ok">Free</span>';
    if (t.fee) tags += '<span class="badge fee">Fee</span>';
    if (t.b) tags += '<span class="badge info">Baby change</span>';
    if (t.r) tags += '<span class="badge info">RADAR</span>';
    if (t.g) tags += '<span class="badge info">All-gender</span>';
    if (t.open === true) tags += '<span class="badge open">Open now</span>';
    if (t.open === false) tags += '<span class="badge closed">Closed</span>';
    var gmaps = 'https://www.google.com/maps/dir/?api=1&destination=' + t.lat + ',' + t.lng;
    var reportHref = t.src === 'toiletmap'
      ? 'https://www.toiletmap.org.uk/loos/' + encodeURIComponent(String(t.i).replace(/^uk-/, ''))
      : 'https://www.openstreetmap.org/' + (String(t.i).indexOf('osm-way-') === 0 ? 'way/' : 'node/') + encodeURIComponent(String(t.i).replace(/^osm-node-/, '').replace(/^osm-way-/, ''));
    var report = '<a class="btn" href="' + reportHref + '" target="_blank" rel="noopener">Report</a>';
    d.innerHTML =
      '<button type="button" class="back" id="detailBack">\u2190 Back</button>' +
      '<h2>' + esc(t.n) + '</h2>' +
      '<div class="sub">' + formatDist(dd) + ' \u00b7 ' + walkMins(dd) + (t.area ? ' \u00b7 ' + esc(t.area) : '') + '</div>' +
      '<div class="actions">' +
      '<a class="btn primary" href="' + gmaps + '" target="_blank" rel="noopener">Directions</a>' +
      '<button type="button" class="btn' + (favOn ? ' fav-on' : '') + '" id="favBtn">' + (favOn ? '\u2605 Saved' : '\u2606 Save') + '</button>' +
      '</div>' +
      '<div class="tags">' + tags + '</div>' +
      '<div class="grid">' +
      '<div class="stat"><div class="stat-l">Distance</div><div class="stat-v">' + formatDist(dd) + '</div></div>' +
      '<div class="stat"><div class="stat-l">Source</div><div class="stat-v">' + (t.src === 'osm' ? 'OpenStreetMap' : 'Toilet Map') + '</div></div>' +
      '</div>' +
      (t.hours ? '<div class="note">Today: ' + esc(t.hours) + '</div>' : '') +
      (t.notes ? '<div class="note">' + esc(t.notes) + '</div>' : '') +
      '<div class="actions">' + report + '</div>' +
      '<p class="credit">Created by Alfie Watts \u00b7 Full data credits in Settings</p>';
    d.classList.add('open');
    $('detailBack').onclick = function () { d.classList.remove('open'); state.selected = null; applyList(); };
    $('favBtn').onclick = function () {
      if (state.favs[t.i]) delete state.favs[t.i];
      else state.favs[t.i] = 1;
      saveJson(LS_FAV, state.favs);
      showDetail(t);
      applyList();
    };
  }

  var UK_PLACES = ['London','Manchester','Birmingham','Leeds','Glasgow','Edinburgh','Liverpool','Bristol','Sheffield','Newcastle upon Tyne','Nottingham','Cardiff','Belfast','Leicester','Coventry','Bradford','Plymouth','Southampton','Reading','Derby','Portsmouth','Brighton','Milton Keynes','Oxford','Cambridge','York','Bath','Paris','New York','Tokyo','Sydney','Berlin','Madrid','Rome','Amsterdam','Dublin','Lisbon','Vienna','Prague','Dubai','Singapore','Toronto','Vancouver','Los Angeles','Chicago','Melbourne','Auckland'];

  function normStr(s) {
    return String(s || '').toLowerCase().replace(/[-']/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function scorePlace(q, place) {
    var nq = normStr(q), np = normStr(place);
    if (!nq) return 0;
    if (np === nq) return 100;
    if (np.indexOf(nq) === 0) return 90;
    if (np.indexOf(nq) >= 0) return 70;
    var qw = nq.split(' '), pw = np.split(' ');
    if (qw.length >= 2) {
      var ok = qw.every(function (w) {
        return pw.some(function (p) { return p.indexOf(w) === 0 || w.indexOf(p) === 0 || p === w; });
      });
      if (ok) return 80;
    }
    if (nq.length >= 3 && np.indexOf(nq.slice(0, 3)) === 0) return 50;
    return 0;
  }

  var suggestTimer;
  function updateSuggest() {
    var q = ($('search') && $('search').value || '').trim();
    var box = $('searchSuggest');
    if (!box) return;
    if (q.length < 2) { box.hidden = true; box.classList.remove('open'); return; }
    var local = UK_PLACES.map(function (p) { return { name: p, score: scorePlace(q, p), sub: '' }; })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 5);
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(async function () {
      try {
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(q);
        var res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        var data = await res.json();
        var remote = (data || []).map(function (r) {
          return { name: r.display_name.split(',')[0], sub: r.display_name, lat: +r.lat, lng: +r.lon, score: 60 };
        });
        var merged = local.concat(remote).slice(0, 8);
        if (!merged.length) { box.hidden = true; box.classList.remove('open'); return; }
        box.innerHTML = merged.map(function (m, i) {
          return '<button type="button" role="option" data-i="' + i + '"><span class="suggest-main">' + esc(m.name) + '</span>' +
            (m.sub ? '<span class="suggest-sub">' + esc(m.sub) + '</span>' : '') + '</button>';
        }).join('');
        box.hidden = false;
        box.classList.add('open');
        box.querySelectorAll('button').forEach(function (btn, i) {
          btn.onclick = function () {
            var m = merged[i];
            box.hidden = true; box.classList.remove('open');
            if (m.lat != null) goTo(m.lat, m.lng, m.name);
            else geocodeAndGo(m.name);
          };
        });
      } catch (e) {
        if (local.length) {
          box.innerHTML = local.map(function (m, i) {
            return '<button type="button"><span class="suggest-main">' + esc(m.name) + '</span></button>';
          }).join('');
          box.hidden = false; box.classList.add('open');
          box.querySelectorAll('button').forEach(function (btn, i) {
            btn.onclick = function () { geocodeAndGo(local[i].name); box.hidden = true; };
          });
        }
      }
    }, 180);
  }

  async function geocodeAndGo(q) {
    try {
      var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
      var data = await res.json();
      if (data && data[0]) goTo(+data[0].lat, +data[0].lon, q);
      else toast('Place not found');
    } catch (e) { toast('Search failed'); }
  }

  function goTo(lat, lng, label) {
    state.searchLock = true;
    state.focusLat = lat;
    state.focusLng = lng;
    state.map.setView([lat, lng], 14);
    if ($('search')) $('search').value = label || '';
    if ($('searchBox')) $('searchBox').classList.toggle('has-value', !!(label));
    refreshNearby();
  }

  function searchThisArea() {
    var c = state.map.getCenter();
    state.searchLock = true;
    state.focusLat = c.lat;
    state.focusLng = c.lng;
    var btn = $('searchAreaBtn');
    if (btn) btn.hidden = true;
    refreshNearby();
  }
