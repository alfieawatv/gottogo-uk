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
