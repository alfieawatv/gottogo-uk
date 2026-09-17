(async function () {
  try {
    var parts = [];
    for (var i = 0; i < 6; i++) {
      var r = await fetch('./c' + i + '.txt?v=1');
      if (!r.ok) throw new Error('chunk ' + i + ' HTTP ' + r.status);
      parts.push(await r.text());
    }
    var code = atob(parts.join(''));
    (0, eval)(code);
  } catch (e) {
    console.error(e);
    document.body.innerHTML = '<div style="padding:2rem;font-family:system-ui;text-align:center"><h1>Could not load</h1><p>Please refresh. ' + (e && e.message ? e.message : '') + '</p></div>';
  }
})();
