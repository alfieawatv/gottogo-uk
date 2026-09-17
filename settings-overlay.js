(function () {
  var LS_UNITS = 'g2g_units';
  var units = localStorage.getItem(LS_UNITS) || 'metric';

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function openSettings() {
    var modal = $('settingsModal');
    if (!modal) return;
    var locStatus = $('locStatus');
    var locBtn = $('settingsLocateBtn');
    function setLocUI(text, mode) {
      if (locStatus) locStatus.textContent = text;
      if (locBtn) {
        locBtn.dataset.mode = mode;
        locBtn.textContent = mode === 'help' ? 'How to enable location' : 'Allow location again';
      }
    }
    if (!navigator.geolocation) {
      setLocUI('Location is not supported on this device.', 'help');
    } else if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
        if (r.state === 'granted') setLocUI('Location is allowed. You can refresh your position with the button below.', 'ask');
        else if (r.state === 'prompt') setLocUI('Location not decided yet. Tap the button to allow it.', 'ask');
        else setLocUI('Location is blocked for this site. Tap below for how to turn it back on, then try again.', 'help');
      }).catch(function () {
        setLocUI('Tap below to request location again.', 'ask');
      });
    } else {
      setLocUI('Tap below to request location again.', 'ask');
    }
    document.querySelectorAll('[data-units]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.units === units);
    });
    modal.hidden = false;
  }

  function closeSettings() {
    var modal = $('settingsModal');
    if (modal) modal.hidden = true;
  }

  function requestLocationAgain() {
    var btn = $('settingsLocateBtn');
    var mode = btn && btn.dataset.mode;
    if (mode === 'help') {
      toast('Browser: site settings \u2192 Location \u2192 Allow, then reload');
      setTimeout(function () {
        toast('iPhone: aA menu \u2192 Website Settings \u2192 Location \u2192 Allow');
      }, 2700);
      return;
    }
    if (!navigator.geolocation) {
      toast('Location not supported');
      return;
    }
    toast('Asking for location\u2026');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        toast('Location allowed \u2014 use the locate button to centre the map');
        var locateBtn = $('locateBtn') || $('fabLocate');
        if (locateBtn) locateBtn.click();
        openSettings();
      },
      function (err) {
        if (err && err.code === 1) {
          toast('Still blocked \u2014 enable location in browser settings');
          if (btn) {
            btn.dataset.mode = 'help';
            btn.textContent = 'How to enable location';
          }
          if ($('locStatus')) {
            $('locStatus').textContent = 'Location is blocked. Enable it in browser settings, then try again.';
          }
        } else {
          toast('Could not get location');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function metricToImperialText(text) {
    if (!text) return text;
    var m = text.match(/^([\d.]+)\s*m$/i);
    if (m) {
      var feet = parseFloat(m[1]) * 3.28084;
      if (feet < 1000) return Math.round(feet) + ' ft';
      return (feet / 5280).toFixed(1) + ' mi';
    }
    var k = text.match(/^([\d.]+)\s*km$/i);
    if (k) {
      var miles = parseFloat(k[1]) * 0.621371;
      return miles.toFixed(miles < 10 ? 1 : 0) + ' mi';
    }
    return text;
  }

  function convertTree(root) {
    if (!root || units !== 'imperial') return;
    root.querySelectorAll('.card-dist').forEach(function (el) {
      var walk = el.querySelector('.card-walk');
      var distText = '';
      el.childNodes.forEach(function (n) {
        if (n.nodeType === 3) distText += n.textContent;
      });
      distText = distText.trim();
      if (!distText) return;
      if (/ft|mi/i.test(distText)) return;
      var converted = metricToImperialText(distText);
      var walkHtml = walk ? walk.outerHTML : '';
      el.innerHTML = converted + walkHtml;
    });
    root.querySelectorAll('.stat-v').forEach(function (el) {
      var t = el.textContent.trim();
      if (/ft|mi/i.test(t)) return;
      if (/\d/.test(t) && /(m|km)$/i.test(t)) el.textContent = metricToImperialText(t);
    });
  }

  function setUnits(u) {
    if (u !== 'metric' && u !== 'imperial') return;
    units = u;
    localStorage.setItem(LS_UNITS, u);
    document.querySelectorAll('[data-units]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.units === u);
    });
    toast(u === 'metric'
      ? 'Metric: metres and kilometres (m, km) \u2014 standard in the UK'
      : 'Imperial: feet and miles (ft, mi)');
    if (u === 'metric') {
      var r = $('radius');
      if (r) r.dispatchEvent(new Event('change'));
    } else {
      convertTree(document);
    }
  }

  function wire() {
    if ($('settingsBtn')) $('settingsBtn').onclick = openSettings;
    if ($('settingsClose')) $('settingsClose').onclick = closeSettings;
    if ($('settingsModal')) {
      $('settingsModal').onclick = function (e) {
        if (e.target === $('settingsModal')) closeSettings();
      };
    }
    if ($('settingsLocateBtn')) $('settingsLocateBtn').onclick = requestLocationAgain;
    document.querySelectorAll('[data-units]').forEach(function (btn) {
      btn.onclick = function () { setUnits(btn.dataset.units); };
    });

    var list = $('list');
    if (list && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        if (units === 'imperial') convertTree(list);
      });
      obs.observe(list, { childList: true, subtree: true });
    }
    var detail = $('detail');
    if (detail && window.MutationObserver) {
      var obs2 = new MutationObserver(function () {
        if (units === 'imperial') convertTree(detail);
      });
      obs2.observe(detail, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(wire, 50); });
  } else {
    setTimeout(wire, 50);
  }
  setTimeout(wire, 1500);
  setTimeout(wire, 4000);
})();
