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

        var payload = { _subject: form.dataset.subject || 'New message — da Cecot Food' };
        new FormData(form).forEach(function (v, k) { if (k !== '_honey') payload[k] = v; });

        fetch('https://formsubmit.co/ajax/info@dacecotfood.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (r) { return r.json(); })
          .then(function (r) {
            if (r.success === 'true' || r.success === true) {
              if (successEl) successEl.classList.add('show');
              form.querySelectorAll('input:not([type=hidden]), textarea, select').forEach(function (f) { f.value = ''; });
            } else {
              if (errorEl) errorEl.classList.add('show');
            }
          })
          .catch(function () { if (errorEl) errorEl.classList.add('show'); })
          .finally(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
      });
    });
  });
})();
