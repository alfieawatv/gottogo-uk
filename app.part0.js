(function () {
  var LS_FAV = 'g2g_favs';
  var LS_RATE = 'g2g_rates';
  var LS_FILT = 'g2g_filter';
  var LS_RAD = 'g2g_radius';
  var LS_THEME = 'g2g_theme';
  var LS_UNITS = 'g2g_units';
  var LS_PANEL = 'g2g_panel';

  var state = {
    all: [], nearby: [], filter: localStorage.getItem(LS_FILT) || 'all',
    userLat: null, userLng: null,
    focusLat: null, focusLng: null,
    searchLock: false,
    map: null, cluster: null, userMarker: null,
    markers: new Map(), selected: null,
    radiusKm: parseFloat(localStorage.getItem(LS_RAD)) || 5,
    locating: false, loading: false, offline: !navigator.onLine,
    favs: loadJson(LS_FAV, {}),
    rates: loadJson(LS_RATE, {}),
    units: localStorage.getItem(LS_UNITS) || 'metric'
  };

  var GQL = 'https://www.toiletmap.org.uk/api';
  var PROXIMITY_QUERY = 'query($from: ProximityInput!) { loosByProximity(from: $from) { id name accessible babyChange radar allGender noPayment notes openingTimes paymentDetails location { lat lng } area { name } } }';
  var OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];

  function $(id) { return document.getElementById(id); }
  function loadJson(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function saveJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function toast(msg, ms) {
    ms = ms || 2600;
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms);
  }

  function haversine(a, b, c, d) {
    var R = 6371e3, r = Math.PI / 180;
    var x = (c - a) * r, y = (d - b) * r;
    var s = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function formatDist(m) {
    if (m == null || isNaN(m)) return '';
    if (state.units === 'imperial') {
      var feet = m * 3.28084;
      if (feet < 1000) return Math.round(feet) + ' ft';
      var miles = m / 1609.344;
      return miles.toFixed(miles < 10 ? 1 : 0) + ' mi';
    }
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }

  function walkMins(m) {
    if (m == null || isNaN(m)) return '';
    var mins = Math.max(1, Math.round(m * 1.25 / 75));
    if (mins < 60) return '~' + mins + ' min walk';
    var h = Math.floor(mins / 60), r = mins % 60;
    return r ? '~' + h + ' h ' + r + ' min' : '~' + h + ' h walk';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var BAD = /\b(fuck(?:ing|ed|er|s)?|shit(?:ty|s)?|bollocks|bastard(?:s)?|arse(?:hole)?s?|asshole(?:s)?|cunt(?:s)?|twat(?:s)?|dick(?:head)?s?|cock(?:s)?|piss(?:ing|ed)?|wank(?:er|ing)?s?)\b/gi;
  function censor(s) {
    if (!s) return '';
    return String(s).replace(BAD, function (m) {
      return m[0] + '#'.repeat(Math.max(0, m.length - 1));
    });
  }

  function inUK(lat, lng) {
    return lat >= 49.5 && lat <= 61.0 && lng >= -8.5 && lng <= 2.2;
  }

  function isOpenNow(openingTimes) {
    if (!openingTimes || !openingTimes.length) return null;
    var d = new Date();
    var day = (d.getDay() + 6) % 7;
    var slot = openingTimes[day];
    if (!slot || slot.length < 2 || !slot[0] || !slot[1]) return null;
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
