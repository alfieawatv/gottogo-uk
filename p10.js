    if (t.free) tags += '<span class="badge ok">Free</span>';
    if (t.fee) tags += '<span class="badge fee">Fee</span>';
    if (t.b) tags += '<span class="badge info">Baby change</span>';
    if (t.r) tags += '<span class="badge info">RADAR</span>';
    if (t.g) tags += '<span class="badge info">All-gender</span>';
    if (t.open === true) tags += '<span class="badge open">Open now</span>';
    if (t.open === false) tags += '<span class="badge closed">Closed</span>';
    var maps = 'https://www.openstreetmap.org/directions?to=' + t.lat + '%2C' + t.lng;
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
