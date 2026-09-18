      '<div class="stat"><div class="stat-l">Distance</div><div class="stat-v">' + formatDist(dd) + '</div></div>' +
      '<div class="stat"><div class="stat-l">Source</div><div class="stat-v">' + (t.src === 'osm' ? 'OpenStreetMap' : 'Toilet Map') + '</div></div>' +
      '</div>' +
      (t.hours ? '<div class="note">Today: ' + esc(t.hours) + '</div>' : '') +
      (t.notes ? '<div class="note">' + esc(t.notes) + '</div>' : '') +
      '<div class="actions">' + report + '</div>' +
      '<p class="credit">Created by Alfie Watts \u00b7 Full data credits in Settings</p>';
    d.classList.add('open');
    $('detailBack').onclick = function () { d.classList.remove('open'); state.selected = null; applyList(); };
    $('favBtn').onclick = function () {
      if (state.favs[t.i]) delete state.favs[t.i];
      else state.favs[t.i] = 1;
      saveJson(LS_FAV, state.favs);
      showDetail(t);
      applyList();
    };
  }

  /* ---------- Search (Nominatim worldwide) ---------- */
