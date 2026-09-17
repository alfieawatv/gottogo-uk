(function () {
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/alfieawatv/gottogo-uk@acdf92859e43e5e4c0efb50b24f9b66ee884c43c/app.js';
  s.onerror = function () {
    var s2 = document.createElement('script');
    s2.src = 'https://raw.githubusercontent.com/alfieawatv/gottogo-uk/acdf92859e43e5e4c0efb50b24f9b66ee884c43c/app.js';
    s2.onerror = function () {
      document.body.innerHTML = '<div style="padding:2rem;font-family:system-ui;text-align:center"><h1>Could not load app</h1><p>Please hard-refresh or try again shortly.</p></div>';
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s);
})();
