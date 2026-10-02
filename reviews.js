(function () {
  var LS = 'g2g_reviews_v1';
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function getReviews(id) {
    var a = loadAll();
    return Array.isArray(a[id]) ? a[id] : [];
  }
  function addReview(id, stars, text) {
    var a = loadAll();
    var list = Array.isArray(a[id]) ? a[id] : [];
    list.push({ s: stars, txt: text || '', at: Date.now() });
    if (list.length > 30) list = list.slice(-30);
    a[id] = list;
    try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {}
  }
  function avgStars(list) {
    if (!list || !list.length) return 0;
    var s = 0;
    list.forEach(function (r) { s += (+r.s || 0); });
    return Math.round((s / list.length) * 10) / 10;
  }
  function starRow(n) {
    var full = Math.round(n || 0), out = '';
    for (var i = 1; i <= 5; i++) out += i <= full ? '\u2605' : '\u2606';
    return '<span class="stars stars-sm">' + out + '</span>';
  }
  function formatDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return ''; }
  }
  function clean(s) {
    if (!s) return '';
    if (/\b(shit|shite|fuck|fucking|cunt|bitch|bastard|dick|piss|arsehole|asshole|wank|bollocks)\b/i.test(s)) return '';
    return s.slice(0, 280);
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function inject(detailEl, toiletId) {
    if (!detailEl || detailEl.querySelector('.review-section')) return;
    var reviews = getReviews(toiletId);
    var listHtml = reviews.slice().reverse().slice(0, 12).map(function (r) {
      return '<div class="review-item"><div class="review-stars">' + starRow(r.s) + '</div>' +
        (r.txt ? '<div class="review-text">' + esc(r.txt) + '</div>' : '') +
        '<div class="review-meta">' + formatDate(r.at) + '</div></div>';
    }).join('') || '<p class="review-empty">No reviews yet \u2014 be the first.</p>';
    var avg = avgStars(reviews);
    var block = document.createElement('div');
    block.className = 'review-section';
    block.innerHTML =
      '<h3 class="review-title">Reviews ' + (reviews.length ? starRow(avg) + ' <span class="review-count">(' + reviews.length + ')</span>' : '') + '</h3>' +
      '<p class="review-hint">Saved on this device only \u2014 not shared with Toilet Map or the internet.</p>' +
      '<div class="review-form">' +
      '<div class="rate" id="rateStars" role="group" aria-label="Your rating">' +
      [1,2,3,4,5].map(function (n) {
        return '<button type="button" data-s="' + n + '" aria-label="' + n + ' stars">\u2606</button>';
      }).join('') +
      '</div>' +
      '<textarea id="reviewText" class="review-input" maxlength="280" rows="2" placeholder="Optional comment (clean language only)"></textarea>' +
      '<button type="button" class="btn primary" id="reviewSubmit" style="width:100%;margin-top:8px">Post review</button>' +
      '</div>' +
      '<div class="review-list">' + listHtml + '</div>';
    var credit = detailEl.querySelector('.credit');
    if (credit) detailEl.insertBefore(block, credit);
    else detailEl.appendChild(block);
    var picked = 0;
    var rateEl = block.querySelector('#rateStars');
    rateEl.querySelectorAll('button').forEach(function (btn) {
      btn.onclick = function () {
        picked = +btn.dataset.s;
        rateEl.querySelectorAll('button').forEach(function (b) {
          var n = +b.dataset.s;
          b.textContent = n <= picked ? '\u2605' : '\u2606';
          b.classList.toggle('on', n <= picked);
        });
      };
    });
    block.querySelector('#reviewSubmit').onclick = function () {
      if (!picked) { toast('Pick a star rating first'); return; }
      var raw = (block.querySelector('#reviewText').value || '').trim();
      var cleaned = clean(raw);
      if (raw && !cleaned) { toast('Please keep the comment clean'); return; }
      addReview(toiletId, picked, cleaned);
      toast('Review saved on this device');
      block.remove();
      inject(detailEl, toiletId);
    };
  }
  var obs = new MutationObserver(function () {
    var d = document.getElementById('detail');
    if (!d || !d.classList.contains('open')) return;
    if (!d.querySelector('h2')) return;
    var card = document.querySelector('.card.active');
    var id = card && card.dataset.id;
    if (!id) return;
    inject(d, id);
  });
  function start() {
    var d = document.getElementById('detail');
    if (d) obs.observe(d, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
