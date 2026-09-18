  var UK_PLACES = ['London','Manchester','Birmingham','Leeds','Glasgow','Edinburgh','Liverpool','Bristol','Sheffield','Newcastle upon Tyne','Nottingham','Cardiff','Belfast','Leicester','Coventry','Bradford','Stoke-on-Trent','Wolverhampton','Plymouth','Southampton','Reading','Derby','Portsmouth','Brighton','Milton Keynes','Northampton','Luton','Bolton','Bournemouth','Norwich','Swindon','Swansea','Southend-on-Sea','Middlesbrough','Peterborough','Cambridge','Oxford','Ipswich','York','Dundee','Aberdeen','Exeter','Bath','Cheltenham','Canterbury','Inverness','Derry','Newry','Bangor','Paris','New York','Tokyo','Sydney','Berlin','Madrid','Rome','Amsterdam','Dublin','Lisbon','Vienna','Prague','Warsaw','Stockholm','Oslo','Copenhagen','Helsinki','Brussels','Zurich','Dubai','Singapore','Hong Kong','Toronto','Vancouver','Los Angeles','Chicago','San Francisco','Miami','Boston','Seattle','Melbourne','Auckland','Cape Town','Mumbai','Delhi','Bangkok','Seoul','Beijing','Shanghai','Istanbul','Athens','Budapest','Bucharest','Sofia','Zagreb','Reykjavik'];

  function normStr(s) {
    return String(s || '').toLowerCase().replace(/[-']/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function scorePlace(q, place) {
    var nq = normStr(q), np = normStr(place);
    if (!nq) return 0;
    if (np === nq) return 100;
    if (np.indexOf(nq) === 0) return 90;
    if (np.indexOf(nq) >= 0) return 70;
    var qw = nq.split(' '), pw = np.split(' ');
    if (qw.length >= 2) {
      var ok = qw.every(function (w) {
        return pw.some(function (p) { return p.indexOf(w) === 0 || w.indexOf(p) === 0 || p === w; });
      });
      if (ok) return 80;
    }
    // simple typo: first 3 chars
    if (nq.length >= 3 && np.indexOf(nq.slice(0, 3)) === 0) return 50;
    return 0;
  }

