(function () {
  var LS_FAV = 'g2g_favs';
  var LS_RATE = 'g2g_rates';
  var LS_FILT = 'g2g_filter';
  var LS_RAD = 'g2g_radius';
  var LS_THEME = 'g2g_theme';
  var LS_CACHE = 'g2g_cache';
  var LS_UNITS = 'g2g_units';

  var state = {
    all: [], static: [], nearby: [], filter: localStorage.getItem(LS_FILT) || 'all',
    userLat: null, userLng: null,
    focusLat: null, focusLng: null,
    searchLock: false,
    map: null, cluster: null, userMarker: null,
    markers: new Map(), selected: null,
    radiusKm: parseFloat(localStorage.getItem(LS_RAD)) || 5,
    locating: false, loading: false, offline: false,
    favs: loadJson(LS_FAV, {}),
    rates: loadJson(LS_RATE, {}),
    units: localStorage.getItem(LS_UNITS) || 'metric'
  };

  var GQL = 'https://www.toiletmap.org.uk/api';
  var PROXIMITY_QUERY = 'query($from: ProximityInput!) { loosByProximity(from: $from) { id name accessible babyChange radar allGender noPayment notes openingTimes paymentDetails location { lat lng } area { name } } }';
  var STATIC_URLS = ['./toilets.json', 'https://gottogo-uk.vercel.app/toilets.json'];
  var staticLoaded = false;

  function $(id) { return document.getElementById(id); }
  function loadJson(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function saveJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function toast(msg, ms) {
    ms = ms || 2600;
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms);
  }

  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {}
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

  function displayDist(t) {
    if (!t) return null;
    if (t.userDist != null && !isNaN(t.userDist)) return t.userDist;
    return t.dist;
  }

  function walkMins(m) {
    if (m == null || isNaN(m)) return '';
    var pathM = m * 1.25;
    var mins = Math.round(pathM / 75);
    if (mins < 1) return '< 1 min walk';
    if (mins === 1) return '~1 min walk';
    if (mins < 60) return '~' + mins + ' min walk';
    var h = Math.floor(mins / 60);
    var r = mins % 60;
    return r ? '~' + h + ' h ' + r + ' min walk' : '~' + h + ' h walk';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  }

  var BAD = /\b(fuck(?:ing|ed|er|s)?|shit(?:ty|s)?|bollocks|bastard(?:s)?|arse(?:hole)?s?|asshole(?:s)?|cunt(?:s)?|twat(?:s)?|dick(?:head)?s?|cock(?:s)?|piss(?:ing|ed)?|wank(?:er|ing)?s?|motherfuck(?:er|ing)?s?|bloody hell)\b/gi;
  function censor(s) {
    if (!s) return '';
    return String(s).replace(BAD, function (m) {
      if (m.length <= 1) return '#';
      return m[0] + '#'.repeat(m.length - 1);
    });
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
    var d = new Date();
    var day = (d.getDay() + 6) % 7;
    var slot = openingTimes[day];
    if (slot && slot[0] && slot[1]) return days[day] + ' ' + slot[0] + '\u2013' + slot[1];
    return null;
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: false, attributionControl: true }).setView([54.5, -2.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    }).addTo(state.map);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    state.cluster = L.markerClusterGroup({
      maxClusterRadius: 48, spiderfyOnMaxZoom: true,
      showCoverageOnHover: false, disableClusteringAtZoom: 16
    });
    state.map.addLayer(state.cluster);
    var moveTimer;
    state.map.on('moveend', function () {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(function () {
        var btn = $('searchAreaBtn');
        if (!btn) return;
        if (state.focusLat == null) {
          if (state.map.getZoom() >= 10) btn.hidden = false;
          return;
        }
        var c = state.map.getCenter();
        var d = haversine(state.focusLat, state.focusLng, c.lat, c.lng);
        btn.hidden = d < 1200;
      }, 200);
    });
  }

  function pinIcon(selected) {
    return L.divIcon({
      className: '',
      html: '<div class="pin' + (selected ? ' selected' : '') + '"><span>\ud83d\udebd</span></div>',
      iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30]
    });
  }

  function setUser(lat, lng) {
    if (state.userMarker) state.userMarker.setLatLng([lat, lng]);
    else {
      state.userMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 2000
      }).addTo(state.map);
    }
  }

  function setSplashStatus(msg) {
    var splash = $('splash');
    if (!splash || splash.classList.contains('hide')) return;
    var p = splash.querySelector('[data-status]');
    if (p) p.textContent = msg;
  }

  function showSplashSpinner() {
    var splash = $('splash');
    if (!splash) return;
    if (!splash.querySelector('.spinner')) {
      var spin = document.createElement('div');
      spin.className = 'spinner';
      spin.setAttribute('aria-hidden', 'true');
      var bar = splash.querySelector('.splash-bar');
      if (bar) bar.replaceWith(spin);
      else splash.appendChild(spin);
    }
    if (!splash.querySelector('[data-status]')) {
      var st = document.createElement('p');
      st.setAttribute('data-status', '');
      st.style.cssText = 'color:var(--muted);font-size:.85rem;margin-top:4px;text-align:center;max-width:260px';
      st.textContent = 'Loading UK toilet data\u2026';
      splash.appendChild(st);
    }
  }
