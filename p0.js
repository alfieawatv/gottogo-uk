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
