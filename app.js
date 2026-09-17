(function(){
  function fail(e){ console.error(e); document.body.innerHTML='<div style="padding:2rem;font-family:system-ui;text-align:center"><h1>Could not load app</h1><p>Refresh please.</p></div>'; }
  var n=22;
  var files=[];
  for(var i=0;i<n;i++) files.push('./b'+i+'.txt?v=1');
  Promise.all(files.map(function(u){
    return fetch(u).then(function(r){ if(!r.ok) throw new Error(u); return r.text(); });
  })).then(function(parts){
    var code = atob(parts.join(''));
    (0,eval)(code);
  }).catch(fail);
})();
