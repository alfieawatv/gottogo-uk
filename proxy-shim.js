(function () {
  var orig = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf('/api/') === 0) {
        return orig.call(this, input, init);
      }
      if (url.indexOf('overpass') !== -1 || url.indexOf('interpreter') !== -1) {
        return orig.call(this, '/api/overpass', init || {});
      }
      if (url.indexOf('toiletmap.org.uk') !== -1) {
        return orig.call(this, '/api/tm', init || {}).catch(function () {
          return orig.call(this, input, init);
        });
      }
      if (url.indexOf('nominatim.openstreetmap.org') !== -1) {
        try {
          var u = new URL(url, location.href);
          var q = u.searchParams.get('q') || '';
          var limit = u.searchParams.get('limit') || '6';
          return orig.call(this, '/api/geocode?q=' + encodeURIComponent(q) + '&limit=' + encodeURIComponent(limit), { method: 'GET' });
        } catch (e) {}
      }
    } catch (e) {}
    return orig.call(this, input, init);
  };
})();
