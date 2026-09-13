(function () {
    const state = {
      all: [], nearby: [], filter: 'all',
      userLat: null, userLng: null,
      map: null, cluster: null, userMarker: null,
      markers: new Map(), selected: null, radiusKm: 5,
      locating: false, loading: false,
    };

    const GQL = 'https://www.toiletmap.org.uk/api';
    const PROXIMITY_QUERY = 'query($from: ProximityInput!) { loosByProximity(from: $from) { id name accessible babyChange radar allGender noPayment notes location { lat lng } area { name } } }';

    const $ = id => document.getElementById(id);

    function toast(msg, ms = 2600) {
      const el = $('toast');
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('show'), ms);
    }

    function haversine(a, b, c, d) {
      const R = 6371e3, r = Math.PI / 180;
      const x = (c - a) * r, y = (d - b) * r;
      const s = Math.sin(x/2)**2 + Math.cos(a*r) * Math.cos(c*r) * Math.sin(y/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    function formatDist(m) {
      if (m == null) return '';
      if (m < 1000) return Math.round(m) + ' m';
      return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
    }

    function esc(s) {
      return String(s || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
    }

    function mapToilet(t, refLat, refLng) {
      const lat = t.location && t.location.lat;
      const lng = t.location && t.location.lng;
      if (lat == null || lng == null) return null;
      const area = Array.isArray(t.area) && t.area[0] ? t.area[0].name : '';
      return {
        i: t.id,
        n: (t.name && String(t.name).trim()) || 'Public Toilet',
        a: area || '',
        lat: +lat, lng: +lng,
        w: t.accessible === true ? 1 : 0,
        f: t.noPayment === true ? 0 : (t.noPayment === false ? 1 : -1),
        b: t.babyChange === true ? 1 : 0,
        r: t.radar === true ? 1 : 0,
        g: t.allGender === true ? 1 : 0,
        note: t.notes || null,
        dist: haversine(refLat, refLng, +lat, +lng),
      };
    }

    function initMap() {
      state.map = L.map('map', { zoomControl: false, attributionControl: true }).setView([54.5, -2.5], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(state.map);
      L.control.zoom({ position: 'bottomright' }).addTo(state.map);
      state.cluster = L.markerClusterGroup({
        maxClusterRadius: 48, spiderfyOnMaxZoom: true,
        showCoverageOnHover: false, disableClusteringAtZoom: 16,
      });
      state.map.addLayer(state.cluster);
      let moveTimer;
      state.map.on('moveend', () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => { if (state.userLat == null) refreshNearby(); }, 400);
      });
    }

    function pinIcon(selected) {
      return L.divIcon({
        className: '',
        html: '<div class="pin' + (selected ? ' selected' : '') + '"><span>🚽</span></div>',
        iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30],
      });
    }

    function setUser(lat, lng) {
      if (state.userMarker) state.userMarker.setLatLng([lat, lng]);
      else {
        state.userMarker = L.marker([lat, lng], {
          icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18,18], iconAnchor: [9,9] }),
          zIndexOffset: 2000,
        }).addTo(state.map);
      }
    }

    async function fetchNearby(lat, lng, radiusM) {
      const res = await fetch(GQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          query: PROXIMITY_QUERY,
          variables: { from: { lat: lat, lng: lng, maxDistance: Math.round(radiusM) } },
        }),
      });
      if (!res.ok) throw new Error('Toilet Map API HTTP ' + res.status);
      const json = await res.json();
      if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'GraphQL error');
      const list = (json.data && json.data.loosByProximity) || [];
      return list.map(function(t) { return mapToilet(t, lat, lng); }).filter(Boolean);
    }

    async function loadData() {
      const items = await fetchNearby(54.5, -2.5, 50000);
      state.all = items;
      $('meta').textContent = 'Ready · Toilet Map live data';
    }

    function matches(t) {
      const f = state.filter;
      if (f === 'all') return true;
      if (f === 'accessible') return t.w === 1;
      if (f === 'free') return t.f === 0;
      if (f === 'baby') return t.b === 1;
      if (f === 'radar') return t.r === 1;
      if (f === 'gender') return t.g === 1;
      return true;
    }

    async function refreshNearby() {
      if (!state.map || state.loading) return;
      const c = state.map.getCenter();
      const lat = state.userLat != null ? state.userLat : c.lat;
      const lng = state.userLng != null ? state.userLng : c.lng;
      const max = state.radiusKm * 1000;
      state.loading = true;
      $('meta').textContent = 'Loading nearby…';
      try {
        const items = await fetchNearby(lat, lng, max);
        state.all = items;
        const list = items.filter(matches).sort(function(a, b) { return a.dist - b.dist; });
        state.nearby = list.slice(0, 250);
        renderList();
        renderMarkers(list.slice(0, 600));
      } catch (e) {
        console.warn(e);
        toast('Could not load toilets nearby');
        $('meta').textContent = 'Failed to load — try again';
      } finally {
        state.loading = false;
      }
    }

    function renderList() {
      const el = $('list');
      const n = state.nearby.length;
      const where = state.userLat != null ? 'of you' : 'of map centre';
      $('meta').textContent = n ? (n + ' within ' + state.radiusKm + ' km ' + where) : ('No matches within ' + state.radiusKm + ' km');
      if (!n) {
        el.innerHTML = '<div class="empty"><div class="emoji">🔍</div><h3>Nothing nearby</h3><p>Try a larger radius, clear filters,<br/>or search a different place.</p></div>';
        return;
      }
      el.innerHTML = state.nearby.map(function(t) {
        const badges = [];
        if (t.w) badges.push('<span class="badge ok">♿</span>');
        if (t.f === 0) badges.push('<span class="badge">Free</span>');
        if (t.f === 1) badges.push('<span class="badge fee">Fee</span>');
        if (t.b) badges.push('<span class="badge">Baby</span>');
        if (t.r) badges.push('<span class="badge info">RADAR</span>');
        if (t.g) badges.push('<span class="badge">All-gender</span>');
        return '<div class="card' + (state.selected === t.i ? ' active' : '') + '" data-id="' + t.i + '" role="button" tabindex="0">' +
          '<div class="card-icon">🚽</div><div class="card-body">' +
          '<div class="card-name">' + esc(t.n) + '</div>' +
          '<div class="card-sub">' + (t.a ? '<span>' + esc(t.a) + '</span>' : '') + badges.join('') + '</div></div>' +
          '<div class="card-dist">' + formatDist(t.dist) + '</div></div>';
      }).join('');
      el.querySelectorAll('.card').forEach(function(card) {
        card.onclick = function() { select(card.dataset.id); };
        card.onkeydown = function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(card.dataset.id); }
        };
      });
    }

    function renderMarkers(items) {
      state.cluster.clearLayers();
      state.markers.clear();
      for (var i = 0; i < items.length; i++) {
        var t = items[i];
        var sel = state.selected === t.i;
        var m = L.marker([t.lat, t.lng], { icon: pinIcon(sel), title: t.n });
        m.bindPopup('<strong>' + esc(t.n) + '</strong><br/><span style="color:#94a3b8;font-size:12px">' + esc(t.a || '') + '</span><br/><span style="color:#2dd4bf;font-weight:600">' + formatDist(t.dist) + '</span>');
        (function(id) { m.on('click', function() { select(id, false); }); })(t.i);
        state.cluster.addLayer(m);
        state.markers.set(t.i, m);
      }
    }

    function select(id, pan) {
      if (pan === undefined) pan = true;
      var t = state.nearby.find(function(x) { return x.i === id; }) || state.all.find(function(x) { return x.i === id; });
      if (!t) return;
      state.selected = id;
      renderList();
      renderMarkers(state.nearby.slice(0, 600));
      if (pan) {
        state.map.setView([t.lat, t.lng], Math.max(state.map.getZoom(), 16), { animate: true });
        var m = state.markers.get(id);
        if (m) setTimeout(function() { m.openPopup(); }, 200);
      }
      showDetail(t);
    }

    function showDetail(t) {
      var el = $('detail');
      var badges = [];
      if (t.w) badges.push('<span class="badge ok">♿ Wheelchair accessible</span>');
      if (t.f === 0) badges.push('<span class="badge">Free to use</span>');
      if (t.f === 1) badges.push('<span class="badge fee">May charge a fee</span>');
      if (t.b) badges.push('<span class="badge">Baby changing</span>');
      if (t.r) badges.push('<span class="badge info">RADAR key</span>');
      if (t.g) badges.push('<span class="badge">All-gender</span>');
      var maps = 'https://www.google.com/maps/dir/?api=1&destination=' + t.lat + ',' + t.lng;
      var tm = 'https://www.toiletmap.org.uk/loos/' + t.i;
      el.innerHTML =
        '<button class="back" id="backBtn">← Back to list</button>' +
        '<h2>' + esc(t.n) + '</h2>' +
        '<div class="sub">' + (t.a ? esc(t.a) + ' · ' : '') + formatDist(t.dist) + ' away</div>' +
        '<div class="actions">' +
          '<a class="btn primary" href="' + maps + '" target="_blank" rel="noopener">Directions</a>' +
          '<button class="btn" type="button" id="shareBtn">Share</button>' +
        '</div>' +
        '<div class="tags">' + badges.join('') + '</div>' +
        '<div class="grid">' +
          '<div class="stat"><div class="stat-l">Distance</div><div class="stat-v">' + (formatDist(t.dist) || '—') + '</div></div>' +
          '<div class="stat"><div class="stat-l">Area</div><div class="stat-v">' + esc(t.a || '—') + '</div></div>' +
        '</div>' +
        (t.note ? '<div class="note">' + esc(t.note) + '</div>' : '') +
        '<a class="btn" href="' + tm + '" target="_blank" rel="noopener" style="margin-bottom:12px">View on Toilet Map</a>' +
        '<div class="credit">Contains data from the <a href="https://www.toiletmap.org.uk/dataset" target="_blank" rel="noopener">Toilet Map</a> © Public Convenience Ltd — <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></div>';
      el.classList.add('open');
      $('backBtn').onclick = function() {
        el.classList.remove('open');
        state.selected = null;
        renderList();
        renderMarkers(state.nearby.slice(0, 600));
      };
      $('shareBtn').onclick = async function() {
        var data = { title: t.n, text: t.n + (t.a ? ' — ' + t.a : ''), url: 'https://www.google.com/maps?q=' + t.lat + ',' + t.lng };
        try {
          if (navigator.share) await navigator.share(data);
          else { await navigator.clipboard.writeText(data.text + '\n' + data.url); toast('Link copied'); }
        } catch (_) {}
      };
    }

    function locate() {
      if (!navigator.geolocation) { toast('Location not supported'); return; }
      if (state.locating) return;
      state.locating = true;
      $('locateBtn').classList.add('active');
      toast('Finding your location…');
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          state.locating = false;
          $('locateBtn').classList.remove('active');
          state.userLat = pos.coords.latitude;
          state.userLng = pos.coords.longitude;
          setUser(state.userLat, state.userLng);
          state.map.setView([state.userLat, state.userLng], 14);
          refreshNearby();
          toast('Toilets near you');
        },
        function(err) {
          state.locating = false;
          $('locateBtn').classList.remove('active');
          toast(err.code === 1 ? 'Location permission denied' : 'Could not get location');
          refreshNearby();
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    }

    async function searchPlace(q) {
      if (!q || q.length < 2) return;
      toast('Searching…');
      try {
        var url = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=' + encodeURIComponent(q) + '&limit=1';
        var res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GotToGo/2.0' } });
        var data = await res.json();
        if (!data.length) { toast('No place found in the UK'); return; }
        var lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
        state.userLat = lat; state.userLng = lng;
        state.map.setView([lat, lng], 13);
        setUser(lat, lng);
        if (state.radiusKm < 8) { $('radius').value = '10'; state.radiusKm = 10; }
        await refreshNearby();
        toast(data[0].display_name.split(',').slice(0, 2).join(','));
      } catch (e) { toast('Search failed — check connection'); }
    }

    $('locateBtn').onclick = locate;
    $('fabLocate').onclick = locate;
    $('radius').onchange = function(e) {
      state.radiusKm = parseFloat(e.target.value) || 5;
      refreshNearby();
    };
    document.querySelector('.toolbar').onclick = function(e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      state.filter = chip.dataset.f;
      var list = state.all.filter(matches).sort(function(a, b) { return a.dist - b.dist; });
      state.nearby = list.slice(0, 250);
      renderList();
      renderMarkers(list.slice(0, 600));
    };
    var searchInput = $('search');
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); searchPlace(searchInput.value.trim()); }
    });
    searchInput.addEventListener('input', function() {
      $('searchBox').classList.toggle('has-value', searchInput.value.length > 0);
    });
    $('searchClear').onclick = function() {
      searchInput.value = '';
      $('searchBox').classList.remove('has-value');
      searchInput.focus();
    };
    $('expandBtn').onclick = function() {
      var p = $('panel');
      p.classList.toggle('expanded');
      $('expandBtn').textContent = p.classList.contains('expanded') ? 'Collapse' : 'Expand';
    };
    $('handle').onclick = function() { $('expandBtn').click(); };

    initMap();
    loadData()
      .then(function() {
        $('splash').classList.add('hide');
        toast('Connected to Toilet Map');
        if (navigator.geolocation) locate();
        else refreshNearby();
      })
      .catch(function(err) {
        $('splash').innerHTML =
          '<div style="font-size:2.5rem">📡</div>' +
          '<h1 style="font-size:1.2rem;margin-top:12px">Couldn’t load data</h1>' +
          '<p style="color:var(--muted);max-width:260px;text-align:center;margin-top:8px">' + esc(err.message) + '</p>' +
          '<button class="btn primary" style="margin-top:16px;max-width:200px" id="retryBtn">Try again</button>';
        var btn = document.getElementById('retryBtn');
        if (btn) btn.onclick = function() { location.reload(); };
      });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function() {});
    }
  })();
