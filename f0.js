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
    radiusKm: parseFloat(localStorage.getItem(LS_RAD)) || 2,
    locating: false, loading: false, offline: !navigator.onLine,
    favs: loadJson(LS_FAV, {}),
    rates: loadJson(LS_RATE, {}),
    units: localStorage.getItem(LS_UNITS) || 'metric'
  };

  var GQL = 'https://www.toiletmap.org.uk/api';
  var PROXIMITY_QUERY = 'query($from: ProximityInput!) { loosByProximity(from: $from) { id name accessible babyChange radar allGender noPayment notes openingTimes paymentDetails location { lat lng } area { name } } }';
  var g2gBlocklist = { names: [], ids: {} };
  function loadBlocklist() {
    fetch('./blocklist.json?v=1').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      g2gBlocklist.names = (d.names || []).map(function (n) { return String(n).toLowerCase(); });
      var ids = {};
      (d.ids || []).forEach(function (id) { ids[String(id)] = 1; });
      g2gBlocklist.ids = ids;
    }).catch(function () {});
  }
  loadBlocklist();

  var OVERPASS_URLS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter'
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
    return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
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

  function osmName(tags) {
    if (!tags) return 'Public toilet';
    if (tags.brand) return tags.brand;
    if (tags.name) return tags.name;
    if (tags['name:en']) return tags['name:en'];
    var a = tags.amenity;
    if (a === 'toilets') return 'Public toilet';
    if (a === 'pub') return 'Pub toilet';
    if (a === 'bar') return 'Bar toilet';
    if (a === 'restaurant') return 'Restaurant toilet';
    if (a === 'cafe') return 'Cafe toilet';
    if (a === 'fast_food') return 'Fast food toilet';
    if (a === 'hotel') return 'Hotel toilet';
    if (a === 'fuel') return 'Petrol station toilet';
    return 'Toilet';
  }

  function isJunkToilet(tags, name) {
    tags = tags || {};
    var access = String(tags.access || '').toLowerCase();
    if (access === 'private' || access === 'no' || access === 'military') return true;
    if (tags.toilets === 'no') return true;
    if (tags['access:toilet'] === 'private' || tags['toilet:access'] === 'private') return true;
    var n = String(name || tags.name || tags['name:en'] || '').toLowerCase();
    if (/(crap|shit|shithouse|poop|turd|fart|piss\s*house|pee\s*pee|my house|my home|private house|someone'?s house|test toilet|dummy|xxx|asdf|lmao|haha|lol toilet)/i.test(n)) return true;
    if ((tags.building === 'house' || tags.building === 'residential' || tags.building === 'apartments') &&
        tags.amenity === 'toilets' && !tags.operator && !tags.brand && !tags.network) return true;
    return false;
  }

  function isNameJunk(name) {
    var n = String(name || '').toLowerCase();
    if (!n) return false;
    if (g2gBlocklist.names && g2gBlocklist.names.length) {
      for (var i = 0; i < g2gBlocklist.names.length; i++) {
        if (n.indexOf(g2gBlocklist.names[i]) >= 0) return true;
      }
    }
    return /(crap|shit|shithouse|poop|turd|fart|piss\s*house|pee\s*pee|my house|my home|private house|test toilet|dummy|xxx|asdf|lmao|haha)/i.test(n);
  }

  function isBlockedId(id) {
    return !!(g2gBlocklist.ids && g2gBlocklist.ids[String(id)]);
  }

  function isChainPlace(tags) {
    tags = tags || {};
    var blob = ((tags.brand || '') + ' ' + (tags.name || '') + ' ' + (tags.operator || '') + ' ' + (tags['brand:en'] || '')).toLowerCase();
    return /\b(mcdonald|mc\s*donald|kfc|kentucky\s*fried|burger\s*king|subway|wendy'?s|taco\s*bell|pizza\s*hut|domino'?s|nando|greggs|costa|starbucks|pret\s*a\s*manger|caf+e?\s*nero|caff[eè]\s*nero|tim\s*hortons|five\s*guys|chipotle|wagamama|itsu|leon)\b/i.test(blob);
  }

  function normalizeOsm(el) {
    var tags = el.tags || {};
    var lat = el.lat, lng = el.lon;
    if (lat == null && el.center) { lat = el.center.lat; lng = el.center.lon; }
    if (lat == null || lng == null) return null;
    var rawName = osmName(tags);
    if (isJunkToilet(tags, rawName)) return null;
    if (isNameJunk(rawName)) return null;
    var oid = 'osm-' + el.type + '-' + el.id;
    if (typeof isBlockedId === 'function' && isBlockedId(oid)) return null;
    var amenity = tags.amenity || 'toilets';
    var chain = isChainPlace(tags);
    var accessible = tags.wheelchair === 'yes' || tags.wheelchair === 'designated';
    var baby = tags.changing_table === 'yes' || tags.baby_changing === 'yes';
    var fee = tags.fee === 'yes';
    var free = tags.fee === 'no' || (!fee && amenity === 'toilets' && !chain);
    var gender = tags.unisex === 'yes' || tags.gender === 'unisex';
    var noteParts = [];
    if (chain || (amenity !== 'toilets' && tags.toilets !== 'no')) {
      noteParts.push('May let customers use the toilet if you ask or buy something');
    }
    if (tags.operator) noteParts.push('Operator: ' + tags.operator);
    if (tags.brand && tags.brand !== tags.name) noteParts.push(tags.brand);
    if (tags.opening_hours) noteParts.push('Hours: ' + tags.opening_hours);
    if (tags.access && tags.access !== 'yes' && tags.access !== 'public') noteParts.push('Access: ' + tags.access);
    if (tags.description) noteParts.push(tags.description);
    if (amenity !== 'toilets' && !chain) {
      noteParts.push('May be available to customers at this ' + amenity.replace(/_/g, ' '));
    }
    return {
      i: oid,
      n: censor(rawName),
      lat: lat, lng: lng,
      a: !!accessible, b: !!baby,
      r: tags.centralkey === 'radar' || tags.radar === 'yes',
      g: !!gender, free: !!free, fee: !!fee,
      notes: censor(noteParts.join(' \u00b7 ')),
      hours: null, open: null,
      area: tags['addr:city'] || tags['addr:town'] || '',
      src: 'osm', osmAmenity: amenity, chain: !!chain
    };
  }

  async function fetchOverpass(lat, lng, radiusM) {
    radiusM = Math.min(Math.max(radiusM, 300), 25000);
    var r = Math.round(radiusM);
    var la = lat.toFixed(5), ln = lng.toFixed(5);
    var around = '(around:' + r + ',' + la + ',' + ln + ')';
    var q = '[out:json][timeout:8][maxsize:33554432];(' +
      'node["amenity"="toilets"]["access"!="private"]["access"!="no"]' + around + ';' +
      'node["amenity"="fast_food"]["brand"~"McDonald|KFC|Burger King|Subway|Wendy|Taco Bell|Pizza Hut|Domino|Nando|Greggs|Five Guys|Chipotle|Tim Horton",i]' + around + ';' +
      'node["amenity"="cafe"]["brand"~"Starbucks|Costa|Pret|Greggs|Nero|Tim Horton",i]' + around + ';' +
      'node["amenity"="fast_food"]["name"~"McDonald|KFC|Burger King|Subway|Wendy|Nando|Greggs",i]' + around + ';' +
      'node["amenity"="pub"]["toilets"="yes"]' + around + ';' +
      'node["amenity"="restaurant"]["toilets"="yes"]' + around + ';' +
      'node["amenity"="fuel"]["toilets"="yes"]' + around + ';' +
      ');out tags;';

    try {
      var apiUrl = '/api/overpass?lat=' + encodeURIComponent(lat.toFixed(4)) +
        '&lng=' + encodeURIComponent(lng.toFixed(4)) +
        '&r=' + encodeURIComponent(String(r)) + '&v=2';
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 9000) : null;
      var opts = {};
      if (ctrl) opts.signal = ctrl.signal;
      var res = await fetch(apiUrl, opts);
      if (t) clearTimeout(t);
      if (res.ok) {
        var data = await res.json();
        if (data && data.elements) {
          return (data.elements || []).map(normalizeOsm).filter(Boolean);
        }
      }
    } catch (e) {}

    var body = 'data=' + encodeURIComponent(q);
    var lastErr = null;
    function tryOne(url) {
      var ctrl2 = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t2 = ctrl2 ? setTimeout(function () { try { ctrl2.abort(); } catch (e) {} }, 8000) : null;
      var o = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      };
      if (ctrl2) o.signal = ctrl2.signal;
      return fetch(url, o).then(function (res) {
        if (t2) clearTimeout(t2);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        return (data.elements || []).map(normalizeOsm).filter(Boolean);
      });
    }
    for (var i = 0; i < OVERPASS_URLS.length; i++) {
      try { return await tryOne(OVERPASS_URLS[i]); }
      catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('Overpass failed');
  }

  function normalizeUk(raw) {
    if (!raw || !raw.location) return null;
    var open = isOpenNow(raw.openingTimes);
    return {
      i: 'uk-' + raw.id,
      n: censor(raw.name || 'Public toilet'),
      lat: raw.location.lat, lng: raw.location.lng,
      a: !!raw.accessible, b: !!raw.babyChange, r: !!raw.radar, g: !!raw.allGender,
      free: raw.noPayment !== false && !raw.paymentDetails,
      fee: !!raw.paymentDetails,
      notes: censor(raw.notes || ''),
      hours: formatHours(raw.openingTimes), open: open,
      area: (raw.area && raw.area.name) || '',
      src: 'toiletmap', pay: raw.paymentDetails || ''
    };
  }

  async function fetchUkToiletMap(lat, lng, radiusKm) {
    try {
      var res = await fetch(GQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: PROXIMITY_QUERY,
          variables: { from: { lat: lat, lng: lng, maxDistance: Math.round(radiusKm * 1000) } }
        })
      });
      if (!res.ok) return [];
