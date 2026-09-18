    var free = tags.fee === 'no' || (!fee && tags.amenity === 'toilets');
    var gender = tags.unisex === 'yes' || tags.gender === 'unisex';
    var noteParts = [];
    if (tags.operator) noteParts.push('Operator: ' + tags.operator);
    if (tags.opening_hours) noteParts.push('Hours: ' + tags.opening_hours);
    if (tags.access) noteParts.push('Access: ' + tags.access);
    if (tags.description) noteParts.push(tags.description);
    if (tags.amenity && tags.amenity !== 'toilets') {
      noteParts.push('May be available to customers at this ' + tags.amenity.replace('_', ' '));
    }
    return {
      i: 'osm-' + el.type + '-' + el.id,
      n: censor(osmName(tags)),
      lat: lat,
      lng: lng,
      a: !!accessible,
      b: !!baby,
      r: tags.centralkey === 'radar' || tags.radar === 'yes',
      g: !!gender,
      free: !!free,
      fee: !!fee,
      notes: censor(noteParts.join(' \u00b7 ')),
      hours: null,
      open: null,
      area: tags['addr:city'] || tags['addr:town'] || '',
      src: 'osm',
      osmAmenity: tags.amenity || 'toilets'
    };
  }

  async function fetchOverpass(lat, lng, radiusM) {
    radiusM = Math.min(Math.max(radiusM, 500), 25000);
    var q = '[out:json][timeout:12];\n(\n'
      + '  node["amenity"="toilets"](around:' + radiusM + ',' + lat + ',' + lng + ');\n'
      + '  way["amenity"="toilets"](around:' + radiusM + ',' + lat + ',' + lng + ');\n'
      + '  node["toilets"="yes"]["amenity"~"^(pub|bar|restaurant|cafe|fast_food|hotel|fuel|biergarten)$"](around:' + radiusM + ',' + lat + ',' + lng + ');\n'
      + ');\nout center tags;';
    var lastErr;
    for (var i = 0; i < OVERPASS_URLS.length; i++) {
      try {
        var res = await fetch(OVERPASS_URLS[i], {
          method: 'POST',
