/* Da Cecot Food — shared interactions */
(function () {
  'use strict';

  // Mark JS active so the reveal animation's initial hidden state applies
  // only when we can actually drive it. No JS = content stays visible.
  document.documentElement.classList.add('js');

  document.addEventListener('DOMContentLoaded', function () {
    /* ---- Mobile nav toggle ---- */
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          links.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    /* ---- Header shadow + back-to-top on scroll ---- */
    var header = document.querySelector('.header');
    var toTop = document.querySelector('.back-to-top');
    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      if (header) header.classList.toggle('scrolled', y > 10);
      if (toTop) toTop.classList.toggle('show', y > 420);
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

    /* ---- Contact form (no backend — friendly client-side handling) ---- */
    var form = document.querySelector('form[data-mock]');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        var msg = form.querySelector('.form-success');
        if (msg) msg.classList.add('show');
        form.querySelectorAll('input, textarea, select').forEach(function (f) {
          if (f.type !== 'submit') f.value = '';
        });
      });
    }
  });
})();
