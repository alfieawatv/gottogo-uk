    var now = d.getHours() * 60 + d.getMinutes();
    function parse(t) {
      var p = String(t).split(':');
      return (+p[0] || 0) * 60 + (+p[1] || 0);
    }
    var o = parse(slot[0]), c = parse(slot[1]);
    if (c < o) return now >= o || now <= c;
    return now >= o && now <= c;
  }

  function formatHours(openingTimes) {
    if (!openingTimes || !openingTimes.length) return null;
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var day = ((new Date()).getDay() + 6) % 7;
    var slot = openingTimes[day];
    if (slot && slot[0] && slot[1]) return days[day] + ' ' + slot[0] + '\u2013' + slot[1];
    return null;
  }

  /* ---------- OpenStreetMap / Overpass (worldwide) ---------- */
  function osmName(tags) {
    if (!tags) return 'Public toilet';
    if (tags.name) return tags.name;
    if (tags['name:en']) return tags['name:en'];
    var a = tags.amenity;
    if (a === 'toilets') return 'Public toilet';
    if (a === 'pub') return 'Pub toilet';
    if (a === 'bar') return 'Bar toilet';
    if (a === 'restaurant') return 'Restaurant toilet';
    if (a === 'cafe') return 'Caf\u00e9 toilet';
    if (a === 'fast_food') return 'Fast food toilet';
    if (a === 'hotel') return 'Hotel toilet';
    if (a === 'fuel') return 'Petrol station toilet';
    return 'Toilet';
  }

  function normalizeOsm(el) {
    var tags = el.tags || {};
    var lat = el.lat, lng = el.lon;
    if (lat == null && el.center) { lat = el.center.lat; lng = el.center.lon; }
    if (lat == null || lng == null) return null;
    var accessible = tags.wheelchair === 'yes' || tags.wheelchair === 'designated';
    var baby = tags.changing_table === 'yes' || tags['changing_table:yes'] === 'yes' || tags.baby_changing === 'yes';
    var fee = tags.fee === 'yes';
