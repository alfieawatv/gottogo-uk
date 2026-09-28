module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  var urls = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];

  var payload = null;

  if (req.method === 'GET') {
    var q = req.query || {};
    var lat = parseFloat(q.lat);
    var lng = parseFloat(q.lng);
    var r = parseInt(q.r, 10);
    if (isNaN(lat) || isNaN(lng)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'lat and lng required' }));
    }
    if (isNaN(r) || r < 300) r = 1500;
    if (r > 8000) r = 8000;
    lat = Math.round(lat * 500) / 500;
    lng = Math.round(lng * 500) / 500;
    r = Math.round(r / 250) * 250;
    var ql =
      '[out:json][timeout:5][maxsize:16777216];' +
      'node["amenity"="toilets"](around:' + r + ',' + lat + ',' + lng + ');out tags;';
    payload = 'data=' + encodeURIComponent(ql);
  } else if (req.method === 'POST') {
    var body = req.body;
    if (typeof body === 'string') {
      payload = body.indexOf('data=') === 0 ? body : 'data=' + encodeURIComponent(body);
    } else if (body && typeof body === 'object') {
      var d = body.data || body.query || body.q;
      payload = 'data=' + encodeURIComponent(typeof d === 'string' ? d : JSON.stringify(body));
    } else {
      var chunks = [];
      await new Promise(function (resolve) {
        req.on('data', function (c) { chunks.push(c); });
        req.on('end', resolve);
      });
      var raw = Buffer.concat(chunks).toString('utf8');
      payload = raw.indexOf('data=') === 0 ? raw : 'data=' + encodeURIComponent(raw);
    }
  } else {
    res.statusCode = 405;
    return res.end('GET or POST');
  }

  var lastErr = 'upstream failed';
  for (var i = 0; i < urls.length; i++) {
    try {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 6000) : null;
      var opts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'GotToGo/1.0 (https://gottogo.app)'
        },
        body: payload
      };
      if (ctrl) opts.signal = ctrl.signal;
      var r = await fetch(urls[i], opts);
      if (timer) clearTimeout(timer);
      if (!r.ok) {
        lastErr = 'HTTP ' + r.status;
        continue;
      }
      var text = await r.text();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Cache-Control',
        'public, s-maxage=1800, max-age=300, stale-while-revalidate=3600'
      );
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=1800');
      res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=1800');
      return res.end(text);
    } catch (e) {
      lastErr = (e && e.message) || String(e);
    }
  }
  res.statusCode = 502;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify({ error: lastErr }));
};
