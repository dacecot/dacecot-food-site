/* da Cecot — Site Manager (admin) SPA. Vanilla JS, no dependencies.
   Talks to /api/admin/* with the session cookie; mutations carry X-CSRF-Token. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var state = { csrf: null, email: null, groups: null, content: {}, base: {}, active: null, store: null, dirty: {}, mustChange: false, canChange: false };

  /* ---------- helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.csrf && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    return fetch('/api/admin/' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* ---------- boot ---------- */
  function boot() {
    api('session').then(function (r) {
      if (r.body && r.body.authed) {
        state.csrf = r.body.csrf; state.email = r.body.email;
        state.mustChange = !!r.body.mustChange; state.canChange = !!r.body.canChange;
        loadDashboard();
      }
      else renderLogin(r.body && r.body.configured === false);
    }).catch(function () { renderLogin(false); });
  }

  /* ---------- login ---------- */
  function renderLogin(notConfigured) {
    var emailField = h('div', { class: 'field' }, [
      h('label', { for: 'lg-email', text: 'Email' }),
      h('input', { id: 'lg-email', type: 'email', autocomplete: 'username', placeholder: 'you@dacecotfood.com' })
    ]);
    var pwField = h('div', { class: 'field' }, [
      h('label', { for: 'lg-pw', text: 'Password' }),
      h('input', { id: 'lg-pw', type: 'password', autocomplete: 'current-password', placeholder: '••••••••' })
    ]);
    var errBox = h('div', { class: 'msg msg--err' });
    var btn = h('button', { class: 'btn btn--full', type: 'submit', text: 'Sign in' });
    var form = h('form', { onsubmit: function (e) {
      e.preventDefault();
      errBox.classList.remove('show');
      var email = document.getElementById('lg-email').value.trim();
      var password = document.getElementById('lg-pw').value;
      if (!password) { errBox.textContent = 'Please enter your password.'; errBox.classList.add('show'); return; }
      btn.disabled = true; btn.textContent = 'Signing in…';
      api('login', { method: 'POST', body: { email: email, password: password } }).then(function (r) {
        if (r.status === 200 && r.body.ok) {
          state.csrf = r.body.csrf;
          state.mustChange = !!r.body.mustChange; state.canChange = !!r.body.canChange;
          loadDashboard();
        }
        else { errBox.textContent = r.body.error || 'Sign in failed.'; errBox.classList.add('show'); btn.disabled = false; btn.textContent = 'Sign in'; }
      }).catch(function () { errBox.textContent = 'Network error. Please try again.'; errBox.classList.add('show'); btn.disabled = false; btn.textContent = 'Sign in'; });
    } }, [emailField, pwField, btn, errBox]);

    var card = h('div', { class: 'login-card' }, [
      h('div', { class: 'logo', text: 'da Cecot' }),
      h('p', { class: 'sub', text: 'Site Manager — sign in to edit your website.' }),
      notConfigured
        ? h('div', { class: 'msg msg--err show', text: 'Admin isn’t set up yet. Your developer needs to set the admin password first.' })
        : form
    ]);
    app.innerHTML = ''; app.appendChild(h('div', { class: 'login-wrap' }, [card]));
  }

  /* ---------- dashboard ---------- */
  function loadDashboard() {
    if (state.mustChange && state.canChange) { renderChangePassword(true); return; }
    api('content').then(function (r) {
      if (r.status !== 200) { renderLogin(false); return; }
      state.groups = r.body.groups; state.content = r.body.content || {}; state.base = JSON.parse(JSON.stringify(state.content));
      state.store = r.body.store; state.active = '__orders'; state.dirty = {};
      renderShell();
    });
  }

  /* ---------- forced password change (first login on the starting password) ---------- */
  function renderChangePassword(forced) {
    var curField = h('div', { class: 'field' }, [
      h('label', { for: 'pw-cur', text: 'Current password' }),
      h('input', { id: 'pw-cur', type: 'password', autocomplete: 'current-password' })
    ]);
    var newField = h('div', { class: 'field' }, [
      h('label', { for: 'pw-new', text: 'New password' }),
      h('input', { id: 'pw-new', type: 'password', autocomplete: 'new-password', placeholder: 'At least 10 characters' })
    ]);
    var new2Field = h('div', { class: 'field' }, [
      h('label', { for: 'pw-new2', text: 'Repeat new password' }),
      h('input', { id: 'pw-new2', type: 'password', autocomplete: 'new-password' })
    ]);
    var errBox = h('div', { class: 'msg msg--err' });
    var btn = h('button', { class: 'btn btn--full', type: 'submit', text: 'Set new password' });
    var form = h('form', { onsubmit: function (e) {
      e.preventDefault();
      errBox.classList.remove('show');
      var cur = document.getElementById('pw-cur').value;
      var nw = document.getElementById('pw-new').value;
      var nw2 = document.getElementById('pw-new2').value;
      if (nw.length < 10) { errBox.textContent = 'Please choose a password of at least 10 characters.'; errBox.classList.add('show'); return; }
      if (nw !== nw2) { errBox.textContent = 'The two passwords don’t match.'; errBox.classList.add('show'); return; }
      btn.disabled = true; btn.textContent = 'Saving…';
      api('password', { method: 'POST', csrf: true, body: { current: cur, next: nw } }).then(function (r) {
        if (r.status === 200 && r.body.ok) { state.csrf = r.body.csrf; state.mustChange = false; toast('Password updated!', 'ok'); loadDashboard(); }
        else { errBox.textContent = r.body.error || 'Could not change the password.'; errBox.classList.add('show'); btn.disabled = false; btn.textContent = 'Set new password'; }
      }).catch(function () { errBox.textContent = 'Network error — please try again.'; errBox.classList.add('show'); btn.disabled = false; btn.textContent = 'Set new password'; });
    } }, [curField, newField, new2Field, btn, errBox]);

    var card = h('div', { class: 'login-card' }, [
      h('div', { class: 'logo', text: 'da Cecot' }),
      h('p', { class: 'sub', text: forced
        ? 'Welcome! Before you start, please set your own password — the starting password is shared and needs to be replaced.'
        : 'Change your password.' }),
      form
    ]);
    app.innerHTML = ''; app.appendChild(h('div', { class: 'login-wrap' }, [card]));
  }

  function renderShell() {
    var nav = h('nav', { class: 'side' }, []);
    nav.appendChild(h('div', { class: 'logo', text: 'da Cecot' }));
    // Orders first — it's the day-to-day view.
    nav.appendChild(h('button', { class: 'navbtn' + (state.active === '__orders' ? ' active' : ''), onclick: function () { state.active = '__orders'; renderShell(); } }, [
      h('span', { class: 'ic', text: '🧾' }), h('span', { text: 'Orders & Bookings' })
    ]));
    state.groups.forEach(function (g) {
      nav.appendChild(h('button', { class: 'navbtn' + (state.active === g.id ? ' active' : ''), onclick: function () { state.active = g.id; renderShell(); } }, [
        h('span', { class: 'ic', text: g.icon || '•' }), h('span', { text: g.title })
      ]));
    });
    nav.appendChild(h('div', { class: 'spacer' }));
    nav.appendChild(h('a', { class: 'navbtn', href: '/', target: '_blank' }, [h('span', { class: 'ic', text: '🔗' }), h('span', { text: 'View site' })]));
    if (state.email) nav.appendChild(h('div', { class: 'who', text: state.email }));
    nav.appendChild(h('button', { class: 'navbtn', onclick: logout }, [h('span', { class: 'ic', text: '↩' }), h('span', { text: 'Sign out' })]));

    var main = h('main', { class: 'main' }, []);
    // Still on the shared starting password but the database isn't connected yet
    // (a change can't be stored) — warn loudly instead of blocking her out.
    if (state.mustChange && !state.canChange) {
      main.appendChild(h('div', { class: 'notice', text: '⚠ You are using the shared starting password. As soon as the database is connected you will be asked to set your own.' }));
    }
    if (state.active === '__orders') renderOrders(main);
    else renderGroup(main, state.groups.filter(function (g) { return g.id === state.active; })[0]);

    app.innerHTML = ''; app.appendChild(h('div', { class: 'shell' }, [nav, main]));
  }

  function logout() {
    api('logout', { method: 'POST', csrf: true }).then(function () { state.csrf = null; renderLogin(false); });
  }

  /* ---------- group form ---------- */
  function renderGroup(main, group) {
    main.appendChild(h('div', { class: 'page-head' }, [
      h('h1', { text: group.title }),
      group.intro ? h('p', { text: group.intro }) : null
    ]));
    var card = h('div', { class: 'card' }, []);
    group.fields.forEach(function (f) { card.appendChild(renderField(f)); });
    main.appendChild(card);

    var saveBtn = h('button', { class: 'btn', text: 'Save changes', onclick: function () { saveGroup(group, saveBtn); } });
    var dirtyLbl = h('span', { class: 'dirty' });
    var bar = h('div', { class: 'savebar' }, [saveBtn, dirtyLbl]);
    main.appendChild(bar);
    updateDirtyLabel(dirtyLbl);
    main._dirtyLbl = dirtyLbl;
  }

  function fieldWrap(f, control, extra) {
    return h('div', { class: 'field' }, [
      h('label', { for: 'f-' + f.key, text: f.label }),
      control,
      extra || null,
      f.help ? h('p', { class: 'help', text: f.help }) : null
    ]);
  }
  function markDirty(key, val) { state.content[key] = val; state.dirty[key] = JSON.stringify(val) !== JSON.stringify(state.base[key]); refreshDirty(); }
  function refreshDirty() {
    var lbl = document.querySelector('.savebar .dirty'); if (lbl) updateDirtyLabel(lbl);
  }
  function updateDirtyLabel(lbl) {
    var n = Object.keys(state.dirty).filter(function (k) { return state.dirty[k]; }).length;
    lbl.textContent = n ? (n + ' unsaved change' + (n > 1 ? 's' : '')) : 'All changes saved';
  }

  function renderField(f) {
    var val = state.content[f.key];
    if (f.type === 'textarea') {
      var ta = h('textarea', { id: 'f-' + f.key, maxlength: f.maxlength || 5000, oninput: function () { markDirty(f.key, ta.value); } });
      ta.value = val == null ? '' : val;
      return fieldWrap(f, ta);
    }
    if (f.type === 'toggle') {
      var cb = h('input', { id: 'f-' + f.key, type: 'checkbox', oninput: function () { markDirty(f.key, cb.checked); } });
      cb.checked = !!val;
      return h('div', { class: 'field' }, [
        h('label', { class: 'toggle', for: 'f-' + f.key }, [cb, h('span', { text: f.label })]),
        f.help ? h('p', { class: 'help', text: f.help }) : null
      ]);
    }
    if (f.type === 'number') {
      var ni = h('input', { id: 'f-' + f.key, type: 'number', min: f.min, max: f.max, oninput: function () { markDirty(f.key, ni.value === '' ? '' : Number(ni.value)); } });
      ni.value = val == null ? '' : val;
      return fieldWrap(f, ni);
    }
    if (f.type === 'list') {
      var lta = h('textarea', { id: 'f-' + f.key, style: 'min-height:150px', oninput: function () { markDirty(f.key, lta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)); } });
      lta.value = Array.isArray(val) ? val.join('\n') : '';
      return fieldWrap(f, lta);
    }
    if (f.type === 'image') {
      var img = h('img', { src: '/' + (val || ''), alt: '' });
      var fileIn = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', style: 'display:none' });
      var upBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Upload new photo', onclick: function () { fileIn.click(); } });
      fileIn.addEventListener('change', function () {
        var file = fileIn.files && fileIn.files[0]; if (!file) return;
        if (file.size > 3 * 1024 * 1024) { toast('Please choose an image under 3 MB.', 'err'); return; }
        upBtn.disabled = true; upBtn.textContent = 'Uploading…';
        var reader = new FileReader();
        reader.onload = function () {
          api('upload', { method: 'POST', csrf: true, body: { data: reader.result, filename: file.name } }).then(function (r) {
            if (r.status === 200 && r.body.ok) { img.src = '/' + r.body.path + '?t=' + Date.now(); markDirty(f.key, r.body.path); toast('Photo uploaded — remember to Save.', 'ok'); }
            else toast(r.body.error || 'Upload failed.', 'err');
          }).catch(function () { toast('Upload failed.', 'err'); }).finally(function () { upBtn.disabled = false; upBtn.textContent = 'Upload new photo'; });
        };
        reader.readAsDataURL(file);
      });
      return fieldWrap(f, h('div', { class: 'thumb' }, [img, upBtn]));
    }
    // text / tel / email / url
    var input = h('input', { id: 'f-' + f.key, type: (f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : f.type === 'tel' ? 'tel' : 'text'), maxlength: f.maxlength || 300, oninput: function () { markDirty(f.key, input.value); } });
    input.value = val == null ? '' : val;
    return fieldWrap(f, input);
  }

  function saveGroup(group, btn) {
    var patch = {};
    group.fields.forEach(function (f) { if (state.dirty[f.key]) patch[f.key] = state.content[f.key]; });
    if (!Object.keys(patch).length) { toast('Nothing to save.', ''); return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    api('content', { method: 'POST', csrf: true, body: { content: patch } }).then(function (r) {
      if (r.status === 200 && r.body.ok) {
        state.content = Object.assign(state.content, r.body.content); state.base = JSON.parse(JSON.stringify(state.content)); state.dirty = {};
        refreshDirty();
        var live = state.store === 'github';
        toast(live ? 'Saved! Your site is updating (about a minute).' : 'Saved!', 'ok');
      } else { toast(r.body.error || 'Could not save.', 'err'); }
    }).catch(function () { toast('Network error while saving.', 'err'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Save changes'; });
  }

  /* ---------- orders & bookings ---------- */
  var ordersFilter = 'all';
  var TYPE_LABEL = { order: 'Pasta Shop', class: 'Class', reservation: 'Reservation', wholesale: 'Wholesale', contact: 'Inquiry' };
  function money(cents) { return cents == null ? '' : '$' + (cents / 100).toFixed(2); }
  function when(iso) {
    try { var d = new Date(iso); return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return iso || ''; }
  }
  function statusChip(o) {
    if (o.details && o.details.fulfilled) return h('span', { class: 'chip chip--ok', text: 'Fulfilled' });
    if (o.payment_status === 'paid') return h('span', { class: 'chip chip--ok', text: 'Paid' });
    if (o.payment_status === 'reminded') return h('span', { class: 'chip chip--warn', text: 'Reminded' });
    if (o.payment_status === 'pending') return h('span', { class: 'chip chip--warn', text: 'Unpaid' });
    return h('span', { class: 'chip', text: '—' });
  }

  function renderOrders(main) {
    main.appendChild(h('div', { class: 'page-head' }, [
      h('h1', { text: 'Orders & Bookings' }),
      h('p', { text: 'Everything submitted through the website — pasta-shop orders, class bookings, and inquiries.' })
    ]));

    var tabs = h('div', { class: 'filter-row' }, []);
    [['all', 'All'], ['order', 'Pasta Shop'], ['class', 'Classes'], ['contact', 'Inquiries'], ['wholesale', 'Wholesale']].forEach(function (t) {
      tabs.appendChild(h('button', { class: 'btn btn--sm ' + (ordersFilter === t[0] ? '' : 'btn--ghost'), onclick: function () { ordersFilter = t[0]; renderShell(); } }, [t[1]]));
    });
    main.appendChild(tabs);

    var listWrap = h('div', {}, [h('div', { class: 'boot', text: 'Loading…' })]);
    main.appendChild(listWrap);

    var path = 'orders' + (ordersFilter !== 'all' ? '?type=' + ordersFilter : '');
    api(path).then(function (r) {
      listWrap.innerHTML = '';
      if (r.status !== 200 || !r.body.ok) { listWrap.appendChild(h('div', { class: 'notice', text: (r.body && r.body.error) || 'Could not load orders.' })); return; }
      var orders = r.body.orders || [];
      if (r.body.store === 'local') {
        listWrap.appendChild(h('div', { class: 'notice', text: 'Heads up: orders are stored locally on this server. On the live site a database keeps them permanently.' }));
      }
      if (!orders.length) { listWrap.appendChild(h('div', { class: 'card', text: 'Nothing here yet — new orders and bookings will appear as customers submit them.' })); return; }

      orders.forEach(function (o) {
        var d = o.details || {};
        var bits = [];
        if (d.item) bits.push(d.item + (d.quantity ? ' × ' + d.quantity : ''));
        if (d.class_date) bits.push(d.class_date + (d.guests ? ' · ' + d.guests : ''));
        if (d.pickup_day) bits.push('Pickup ' + d.pickup_day + (d.pickup_time ? ' at ' + d.pickup_time : ''));
        if (d.allergies && d.allergies.toLowerCase() !== 'none') bits.push('Allergies: ' + d.allergies);
        if (d.notes) bits.push(d.notes);
        if (d.message) bits.push(d.message);

        var actions = h('div', { class: 'order-actions' }, []);
        function act(action, label, btnCls) {
          var b = h('button', { class: 'btn btn--sm ' + btnCls, text: label, onclick: function () {
            b.disabled = true;
            api('orders', { method: 'POST', csrf: true, body: { id: o.id, action: action } }).then(function (rr) {
              if (rr.status === 200 && rr.body.ok) { toast('Updated.', 'ok'); renderShell(); }
              else { toast((rr.body && rr.body.error) || 'Could not update.', 'err'); b.disabled = false; }
            }).catch(function () { toast('Network error.', 'err'); b.disabled = false; });
          } });
          return b;
        }
        if ((o.payment_status === 'pending' || o.payment_status === 'reminded')) actions.appendChild(act('mark_paid', 'Mark paid', 'btn--green'));
        if (!(d.fulfilled) && (o.type === 'order' || o.type === 'class')) actions.appendChild(act('mark_fulfilled', 'Mark fulfilled', 'btn--ghost'));

        listWrap.appendChild(h('div', { class: 'card order-card' }, [
          h('div', { class: 'order-top' }, [
            h('span', { class: 'chip chip--type', text: TYPE_LABEL[o.type] || o.type }),
            h('strong', { text: o.name || 'Unknown' }),
            statusChip(o),
            o.amount_cents != null ? h('span', { class: 'order-amt', text: money(o.amount_cents) }) : null,
            h('span', { class: 'order-when', text: when(o.created_at) })
          ]),
          bits.length ? h('p', { class: 'order-bits', text: bits.join(' · ') }) : null,
          h('p', { class: 'order-contact' }, [
            o.email ? h('a', { href: 'mailto:' + o.email, text: o.email }) : null,
            o.email && o.phone ? h('span', { text: ' · ' }) : null,
            o.phone ? h('a', { href: 'tel:' + o.phone, text: o.phone }) : null
          ]),
          actions
        ]));
      });
    }).catch(function () { listWrap.innerHTML = ''; listWrap.appendChild(h('div', { class: 'notice', text: 'Could not load orders.' })); });
  }


  boot();
})();
