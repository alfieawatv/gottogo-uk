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
