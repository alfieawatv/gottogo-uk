module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('POST only');
  }

  var body = req.body;
  var payload;
  if (typeof body === 'string') {
    payload = body.indexOf('data=') === 0 ? body : 'data=' + encodeURIComponent(body);
  } else if (body && typeof body === 'object') {
    var q = body.data || body.query || body.q;
    payload = 'data=' + encodeURIComponent(typeof q === 'string' ? q : JSON.stringify(body));
  } else {
    var chunks = [];
    await new Promise(function (resolve) {
      req.on('data', function (c) { chunks.push(c); });
      req.on('end', resolve);
    });
    var raw = Buffer.concat(chunks).toString('utf8');
    payload = raw.indexOf('data=') === 0 ? raw : 'data=' + encodeURIComponent(raw);
  }

  var urls = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];

  var lastErr = 'upstream failed';
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'GotToGo/1.0 (https://gottogo.app)' },
        body: payload
      });
      var text = await r.text();
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.end(text);
    } catch (e) {
      lastErr = (e && e.message) || String(e);
    }
  }
  res.statusCode = 502;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ error: lastErr }));
};
