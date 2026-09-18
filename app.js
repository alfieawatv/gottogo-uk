(function () {
  function fail(e) {
    console.error(e);
    document.body.innerHTML = '<div style="padding:2rem;font-family:system-ui;text-align:center"><h1>Could not load app</h1><p>Please refresh.</p></div>';
  }
  var n = 19;
  var files = [];
  for (var i = 0; i < n; i++) files.push('./p' + i + '.js?v=w5');
  Promise.all(files.map(function (u) {
    return fetch(u).then(function (r) {
      if (!r.ok) throw new Error(u + ' ' + r.status);
      return r.text();
    });
  })).then(function (parts) {
    (0, eval)(parts.join(''));
  }).catch(fail);
})();
