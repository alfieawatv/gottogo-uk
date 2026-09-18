          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var list = (data.elements || []).map(normalizeOsm).filter(Boolean);
        return list;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Overpass failed');
  }

  /* ---------- UK Toilet Map (extra detail when in UK) ---------- */
  function normalizeUk(raw) {
    if (!raw || !raw.location) return null;
    var open = isOpenNow(raw.openingTimes);
    return {
      i: 'uk-' + raw.id,
      n: censor(raw.name || 'Public toilet'),
      lat: raw.location.lat,
      lng: raw.location.lng,
      a: !!raw.accessible,
      b: !!raw.babyChange,
      r: !!raw.radar,
      g: !!raw.allGender,
      free: raw.noPayment !== false && !raw.paymentDetails,
      fee: !!raw.paymentDetails,
      notes: censor(raw.notes || ''),
      hours: formatHours(raw.openingTimes),
      open: open,
      area: (raw.area && raw.area.name) || '',
      src: 'toiletmap',
      pay: raw.paymentDetails || ''
    };
  }

  async function fetchUkToiletMap(lat, lng, radiusKm) {
    try {
      var res = await fetch(GQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: PROXIMITY_QUERY,
          variables: { from: { lat: lat, lng: lng, maxDistance: Math.round(radiusKm * 1000) } }
        })
      });
      if (!res.ok) return [];
      var data = await res.json();
      var loos = (data.data && data.data.loosByProximity) || [];
      return loos.map(normalizeUk).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

