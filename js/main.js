/* Da Cecot Food — shared interactions */
(function () {
  'use strict';

  // Mark JS active so the reveal animation's initial hidden state applies
  // only when we can actually drive it. No JS = content stays visible.
  document.documentElement.classList.add('js');

  document.addEventListener('DOMContentLoaded', function () {
    /* ---- Mobile nav drawer (toggle, close button, backdrop, Esc) ---- */
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    var backdrop = document.querySelector('.nav-backdrop');
    var closeBtn = document.querySelector('.nav-close');

    function setNav(open) {
      if (!links || !toggle) return;
      links.classList.toggle('open', open);
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('nav-open', open);
      if (backdrop) {
        backdrop.classList.toggle('show', open);
        if (open) backdrop.removeAttribute('hidden');
      }
    }

    if (toggle && links) {
      toggle.addEventListener('click', function () {
        setNav(!links.classList.contains('open'));
      });
      if (closeBtn) closeBtn.addEventListener('click', function () { setNav(false); });
      if (backdrop) backdrop.addEventListener('click', function () { setNav(false); });
      links.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { setNav(false); });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && links.classList.contains('open')) setNav(false);
      });
    }

    /* ---- Dropdown (click on mobile, hover handled by CSS on desktop) ---- */
    document.querySelectorAll('.dropdown-toggle').forEach(function (btn) {
      var menu = btn.parentElement.querySelector('.dropdown-menu');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var open = menu.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    /* ---- FAQ accordion ---- */
    document.querySelectorAll('.faq-q').forEach(function (q) {
      q.addEventListener('click', function () {
        var item = q.closest('.faq-item');
        var isOpen = item.classList.contains('open');
        item.classList.toggle('open', !isOpen);
        q.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    });

    /* ---- Header shadow + back-to-top on scroll ---- */
    var header = document.querySelector('.header');
    var toTop = document.querySelector('.back-to-top');
    var footerEl = document.querySelector('.footer');
    var footerVisible = false;
    // Hide the back-to-top button once the footer is in view so it never
    // overlaps the footer text.
    if (footerEl && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        footerVisible = entries[0].isIntersecting;
        onScroll();
      }, { rootMargin: '0px 0px -40px 0px' }).observe(footerEl);
    }
    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      if (header) header.classList.toggle('scrolled', y > 10);
      if (toTop) toTop.classList.toggle('show', y > 420 && !footerVisible);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* ---- Fade-up reveal on scroll ---- */
    var revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && revealEls.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(function (el) { io.observe(el); });

      // Failsafe: if the observer never delivers (e.g. tab loaded hidden),
      // reveal everything after a short delay so content is never stuck.
      setTimeout(function () {
        revealEls.forEach(function (el) { el.classList.add('visible'); });
      }, 2500);
    } else {
      revealEls.forEach(function (el) { el.classList.add('visible'); });
    }

    /* ---- Form submission via Formsubmit AJAX ---- */
    document.querySelectorAll('form[data-formsubmit]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }

        var btn = form.querySelector('button[type="submit"]');
        var successEl = form.querySelector('.form-success');
        var errorEl = form.querySelector('.form-error');
        var label = btn ? btn.textContent : '';

        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

        // Optional Square checkout: open a tab now (within the click gesture) so
        // it isn't popup-blocked; we point it at the pay URL once the email sends.
        var payUrl = form.dataset.payUrl || '';
        var payWin = payUrl ? window.open('', '_blank') : null;

        var payload = { _subject: form.dataset.subject || 'New message — da Cecot Food' };
        new FormData(form).forEach(function (v, k) { payload[k] = v; });

        fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (r) { return r.json(); })
          .then(function (r) {
            if (r.success === 'true' || r.success === true) {
              if (successEl) successEl.classList.add('show');
              form.querySelectorAll('input:not([type=hidden]), textarea, select').forEach(function (f) { f.value = ''; });
              if (payUrl) {
                if (payWin && !payWin.closed) { payWin.location = payUrl; }
                else { window.location.href = payUrl; }
              }
            } else {
              if (errorEl) errorEl.classList.add('show');
              if (payWin) payWin.close();
            }
          })
          .catch(function () { if (errorEl) errorEl.classList.add('show'); if (payWin) payWin.close(); })
          .finally(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
      });
    });

    /* ---- Per-product order modal (Pasta Shop) ---- */
    var orderModal = document.querySelector('[data-order-modal]');
    if (orderModal) {
      var omForm = orderModal.querySelector('form');
      var omTitle = orderModal.querySelector('[data-order-title]');
      var omPrice = orderModal.querySelector('[data-order-price]');
      var omProduct = orderModal.querySelector('[data-order-product]');
      var omNote = orderModal.querySelector('[data-order-note]');
      var omSubmit = orderModal.querySelector('[data-order-submit]');
      var openOrder = function (btn) {
        var product = btn.getAttribute('data-product') || 'Order';
        var price = btn.getAttribute('data-price') || '';
        var pay = btn.getAttribute('data-pay') || '';
        if (omTitle) omTitle.textContent = product;
        if (omPrice) omPrice.textContent = price ? price + ' each' : '';
        if (omProduct) omProduct.value = product;
        omForm.dataset.subject = 'Pasta Shop Order: ' + product;
        if (pay) { omForm.dataset.payUrl = pay; if (omNote) omNote.style.display = ''; if (omSubmit) omSubmit.textContent = 'Proceed to Payment'; }
        else { delete omForm.dataset.payUrl; if (omNote) omNote.style.display = 'none'; if (omSubmit) omSubmit.textContent = 'Send My Order'; }
        omForm.querySelectorAll('.form-success, .form-error').forEach(function (e) { e.classList.remove('show'); });
        orderModal.hidden = false;
        document.body.classList.add('nav-open');
      };
      var closeOrder = function () { orderModal.hidden = true; document.body.classList.remove('nav-open'); };
      document.querySelectorAll('[data-order-open]').forEach(function (b) {
        b.addEventListener('click', function () { openOrder(b); });
      });
      orderModal.querySelectorAll('[data-order-close]').forEach(function (c) { c.addEventListener('click', closeOrder); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !orderModal.hidden) closeOrder(); });
    }

    /* ---- Notebook slider (auto-advance + swipe + dots) ---- */
    document.querySelectorAll('[data-note-slider]').forEach(function (slider) {
      var track = slider.querySelector('[data-note-track]');
      var dotsWrap = slider.querySelector('[data-note-dots]');
      if (!track || !dotsWrap) return;
      var n = track.children.length;
      if (n < 2) return;
      var idx = 0, timer = null, scrollT = null;
      var dots = [];
      for (var i = 0; i < n; i++) {
        (function (i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-label', 'Notebook page ' + (i + 1));
          b.addEventListener('click', function () { go(i, true); });
          dotsWrap.appendChild(b);
          dots.push(b);
        })(i);
      }
      function setActive(i) {
        idx = i;
        for (var k = 0; k < n; k++) dots[k].setAttribute('aria-current', k === i ? 'true' : 'false');
      }
      function go(i, user) {
        i = (i + n) % n;
        track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
        setActive(i);
        if (user) restart();
      }
      function start() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        timer = setInterval(function () { go(idx + 1); }, 5000);
      }
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      function restart() { stop(); start(); }
      track.addEventListener('scroll', function () {
        clearTimeout(scrollT);
        scrollT = setTimeout(function () {
          var i = Math.round(track.scrollLeft / track.clientWidth);
          if (i !== idx) setActive(i);
        }, 120);
      }, { passive: true });
      ['mouseenter', 'touchstart', 'pointerdown'].forEach(function (ev) { slider.addEventListener(ev, stop, { passive: true }); });
      ['mouseleave', 'touchend'].forEach(function (ev) { slider.addEventListener(ev, start, { passive: true }); });
      setActive(0);
      start();
    });

    /* ---- Booking calendar ---- */
    var WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MO_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    function calIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function isFirstWeekdayOfMonth(d) { return d.getDate() <= 7; }

    document.querySelectorAll('.cal').forEach(function (cal) {
      var weekday = parseInt(cal.dataset.calWeekday, 10);
      var blockFirst = cal.dataset.calBlockFirst === '1';
      var count = parseInt(cal.dataset.calWeeks, 10) || 8;
      var startISO = cal.dataset.calStart;
      var input = cal.querySelector('input[data-cal-input]');
      var titleEl = cal.querySelector('[data-cal-title]');
      var gridEl = cal.querySelector('[data-cal-grid]');
      var selEl = cal.querySelector('[data-cal-selected]');
      var defaultPrompt = selEl ? selEl.innerHTML : '';
      var prevBtn = cal.querySelector('[data-cal-prev]');
      var nextBtn = cal.querySelector('[data-cal-next]');
      if (!input || !gridEl) return;

      var today = new Date(); today.setHours(0, 0, 0, 0);
      var begin = today;
      if (startISO) { var p = startISO.split('-'); var s = new Date(+p[0], +p[1] - 1, +p[2]); if (s > begin) begin = new Date(s); }
      var cur = new Date(begin);
      while (cur.getDay() !== weekday) cur.setDate(cur.getDate() + 1);
      var allowed = [], guard = 0;
      while (allowed.length < count && guard < 400) {
        guard++;
        if (!(blockFirst && isFirstWeekdayOfMonth(cur))) allowed.push(calIso(cur));
        cur.setDate(cur.getDate() + 7);
      }
      if (!allowed.length) return;
      var allowedSet = {}; allowed.forEach(function (a) { allowedSet[a] = 1; });
      function ymd(str) { return new Date(+str.slice(0, 4), +str.slice(5, 7) - 1, +str.slice(8, 10)); }
      var firstD = ymd(allowed[0]), lastD = ymd(allowed[allowed.length - 1]);
      var view = new Date(firstD.getFullYear(), firstD.getMonth(), 1);
      var minView = new Date(firstD.getFullYear(), firstD.getMonth(), 1);
      var maxView = new Date(lastD.getFullYear(), lastD.getMonth(), 1);

      function select(key, d) {
        input.value = key;
        if (selEl) selEl.innerHTML = 'Selected: <strong>' + WD_LONG[d.getDay()] + ', ' + MO_LONG[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + '</strong>';
        render();
      }
      function render() {
        if (titleEl) titleEl.textContent = MO_LONG[view.getMonth()] + ' ' + view.getFullYear();
        if (prevBtn) prevBtn.disabled = view <= minView;
        if (nextBtn) nextBtn.disabled = view >= maxView;
        gridEl.innerHTML = '';
        var firstDay = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
        var daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        var i;
        for (i = 0; i < firstDay; i++) { var e = document.createElement('div'); e.className = 'cal__cell cal__cell--empty'; gridEl.appendChild(e); }
        for (var day = 1; day <= daysInMonth; day++) {
          var d = new Date(view.getFullYear(), view.getMonth(), day);
          var key = calIso(d), cell;
          if (allowedSet[key]) {
            cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cal__cell cal__cell--open' + (input.value === key ? ' cal__cell--selected' : '');
            cell.addEventListener('click', (function (k, dt) { return function () { select(k, dt); }; })(key, d));
          } else if (blockFirst && d.getDay() === weekday && isFirstWeekdayOfMonth(d) && d >= today) {
            cell = document.createElement('div');
            cell.className = 'cal__cell cal__cell--blocked';
            cell.title = 'Closed — first ' + WD_LONG[weekday] + ' of the month';
          } else {
            cell = document.createElement('div');
            cell.className = 'cal__cell cal__cell--muted';
          }
          cell.textContent = day;
          gridEl.appendChild(cell);
        }
      }
      if (prevBtn) prevBtn.addEventListener('click', function () { if (view > minView) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); } });
      if (nextBtn) nextBtn.addEventListener('click', function () { if (view < maxView) { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); } });
      render();

      var form = cal.closest('form');
      if (form) {
        form.addEventListener('submit', function (e) {
          if (!input.value) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (selEl) selEl.innerHTML = '<strong style="color:var(--terracotta);">Please pick a date above before continuing.</strong>';
            cal.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, true);
      }
    });
  });
})();
