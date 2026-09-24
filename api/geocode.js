module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  var q = (req.query && (req.query.q || req.query.query)) || '';
  if (!q) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'missing q' }));
  }
  try {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=' +
      encodeURIComponent((req.query && req.query.limit) || '6') +
      '&q=' + encodeURIComponent(q);
    var r = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'GotToGo/1.0 (https://gottogo.app; toilet finder)'
      }
    });
    var text = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.end(text);
  } catch (e) {
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: (e && e.message) || 'geocode failed' }));
  }
};
