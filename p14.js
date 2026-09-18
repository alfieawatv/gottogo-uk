        });
      } catch (e) {
        if (local.length) {
          box.innerHTML = local.map(function (m, i) {
            return '<button type="button"><span class="suggest-main">' + esc(m.name) + '</span></button>';
          }).join('');
          box.hidden = false; box.classList.add('open');
          box.querySelectorAll('button').forEach(function (btn, i) {
            btn.onclick = function () { geocodeAndGo(local[i].name); box.hidden = true; };
          });
        }
      }
    }, 220);
  }

  async function geocodeAndGo(q) {
    try {
      var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
      var data = await res.json();
      if (data && data[0]) goTo(+data[0].lat, +data[0].lon, q);
      else toast('Place not found');
    } catch (e) {
      toast('Search failed');
    }
  }

  function goTo(lat, lng, label) {
    state.searchLock = true;
    state.focusLat = lat;
    state.focusLng = lng;
    state.map.setView([lat, lng], 14);
    if ($('search')) $('search').value = label || '';
    if ($('searchBox')) $('searchBox').classList.toggle('has-value', !!(label));
    refreshNearby();
  }

  function searchThisArea() {
    var c = state.map.getCenter();
    state.searchLock = true;
    state.focusLat = c.lat;
    state.focusLng = c.lng;
    var btn = $('searchAreaBtn');
    if (btn) btn.hidden = true;
    refreshNearby();
  }

  function locateUser(force) {
    if (!navigator.geolocation) {
      toast('Location not supported');
      return;
    }
    state.locating = true;
    toast('Finding you\u2026');
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.locating = false;
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
