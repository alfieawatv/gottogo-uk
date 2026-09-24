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
  if (!body || typeof body === 'string') {
    var chunks = [];
    if (!body) {
      await new Promise(function (resolve) {
        req.on('data', function (c) { chunks.push(c); });
        req.on('end', resolve);
      });
      body = Buffer.concat(chunks).toString('utf8');
    }
    try { body = JSON.parse(body); } catch (e) {}
  }

  try {
    var r = await fetch('https://www.toiletmap.org.uk/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GotToGo/1.0 (https://gottogo.app)',
        'Accept': 'application/json'
      },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
    var text = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.end(text);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: (e && e.message) || 'Toilet Map proxy failed' }));
  }
};
