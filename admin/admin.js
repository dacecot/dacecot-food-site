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
    api('auth?action=session').then(function (r) {
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
      api('auth?action=login', { method: 'POST', body: { email: email, password: password } }).then(function (r) {
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
      state.store = r.body.store; state.active = '__reservations'; state.dirty = {};
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
      api('auth?action=password', { method: 'POST', csrf: true, body: { current: cur, next: nw } }).then(function (r) {
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
    // Reservations + Orders first — the day-to-day views.
    nav.appendChild(h('button', { class: 'navbtn' + (state.active === '__reservations' ? ' active' : ''), onclick: function () { state.active = '__reservations'; renderShell(); } }, [
      h('span', { class: 'ic', text: '🍽️' }), h('span', { text: 'Reservations' })
    ]));
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
    else if (state.active === '__reservations') renderReservations(main);
    else renderGroup(main, state.groups.filter(function (g) { return g.id === state.active; })[0]);

    app.innerHTML = ''; app.appendChild(h('div', { class: 'shell' }, [nav, main]));
  }

  function logout() {
    api('auth?action=logout', { method: 'POST', csrf: true }).then(function () { state.csrf = null; renderLogin(false); });
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

  /* ---------- reservations (day/week views, floor plan, seating, import) ---------- */
  var resView = 'week';

  function fmtDay(iso) {
    if (!iso || iso === 'unknown') return 'No date';
    var p = iso.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function modal(title, bodyEl) {
    var back = h('div', { class: 'modal-back', onclick: function (e) { if (e.target === back) close(); } }, []);
    function close() { back.remove(); }
    var box = h('div', { class: 'modal-box' }, [
      h('div', { class: 'modal-head' }, [h('h3', { text: title }), h('button', { class: 'modal-x', text: '×', onclick: close })]),
      bodyEl
    ]);
    back.appendChild(box);
    document.body.appendChild(back);
    return { close: close };
  }

  function renderReservations(main) {
    main.appendChild(h('div', { class: 'page-head' }, [
      h('h1', { text: 'Reservations' }),
      h('p', { text: 'Your reservation book — today, the week ahead, the floor plan, and your history.' })
    ]));

    var tabs = h('div', { class: 'filter-row' }, []);
    [['today', 'Today'], ['week', 'This Week'], ['upcoming', 'All Upcoming'], ['past', 'Past'], ['__plan', 'Floor Plan'], ['__addimport', 'Add / Import']].forEach(function (t) {
      tabs.appendChild(h('button', { class: 'btn btn--sm ' + (resView === t[0] ? '' : 'btn--ghost'), onclick: function () { resView = t[0]; renderShell(); } }, [t[1]]));
    });
    main.appendChild(tabs);

    var wrap = h('div', {}, [h('div', { class: 'boot', text: 'Loading…' })]);
    main.appendChild(wrap);

    if (resView === '__plan') { renderFloorPlan(wrap); return; }
    if (resView === '__addimport') { renderAddImport(wrap); return; }

    api('reservations?view=' + resView).then(function (r) {
      wrap.innerHTML = '';
      if (r.status !== 200 || !r.body.ok) { wrap.appendChild(h('div', { class: 'notice', text: (r.body && r.body.error) || 'Could not load reservations.' })); return; }
      var tablesById = {};
      (r.body.tables || []).forEach(function (t) { tablesById[t.id] = t; });

      var totals = r.body.totals || {};
      wrap.appendChild(h('p', { class: 'res-totals', text: (totals.upcoming || 0) + ' upcoming · ' + (totals.past || 0) + ' past · ' + (totals.all || 0) + ' total' }));

      if (!r.body.days.length) {
        wrap.appendChild(h('div', { class: 'card', text: resView === 'today' ? 'No reservations today (yet).' : resView === 'past' ? 'No past reservations on record.' : 'No reservations in this view yet.' }));
        return;
      }

      r.body.days.forEach(function (day) {
        var isToday = day.date === r.body.today;
        var head = h('div', { class: 'res-day-head' + (isToday ? ' res-day-head--today' : '') }, [
          h('strong', { text: (isToday ? 'Today — ' : '') + fmtDay(day.date) }),
          h('span', { text: day.count + ' reservation' + (day.count > 1 ? 's' : '') + ' · ' + day.covers + ' guest' + (day.covers === 1 ? '' : 's') })
        ]);
        var list = h('div', { class: 'card res-day' }, [head]);

        day.reservations.forEach(function (o) {
          var d = o.details || {};
          var table = d.table_id ? tablesById[d.table_id] : null;
          var row = h('div', { class: 'res-row' + (d.cancelled ? ' res-row--cancelled' : '') }, [
            h('span', { class: 'res-time', text: d.reservation_time || '—' }),
            h('span', { class: 'res-name' }, [
              h('strong', { text: o.name || 'Unknown' }),
              d.notes ? h('em', { class: 'res-notes', text: ' · ' + d.notes }) : null,
              d.source === 'wix' ? h('span', { class: 'chip', text: 'Wix', style: 'margin-left:8px' }) : null,
              d.source === 'staff' ? h('span', { class: 'chip', text: 'Phone', style: 'margin-left:8px' }) : null
            ]),
            h('span', { class: 'res-party', text: d.party_size || '' }),
            d.cancelled
              ? h('span', { class: 'chip chip--err', text: 'Cancelled' })
              : h('button', { class: 'btn btn--sm ' + (table ? 'btn--ghost' : 'btn--green'), text: table ? '🪑 ' + table.name : 'Seat', onclick: function () { openSeatPicker(o, r.body.tables, tablesById, day); } }),
            h('span', { class: 'res-contact' }, [
              o.phone ? h('a', { href: 'tel:' + o.phone, text: '📞' , title: o.phone }) : null,
              o.email ? h('a', { href: 'mailto:' + o.email, text: '✉️', title: o.email, style: 'margin-left:6px' }) : null
            ]),
            d.cancelled ? null : h('span', { class: 'res-more' }, [
              h('button', { class: 'btn btn--sm btn--ghost', text: '⋯', onclick: function () { openResActions(o); } })
            ])
          ]);
          list.appendChild(row);
        });
        wrap.appendChild(list);
      });
    }).catch(function () { wrap.innerHTML = ''; wrap.appendChild(h('div', { class: 'notice', text: 'Could not load reservations.' })); });
  }

  function resAction(id, action, extra, done) {
    api('orders', { method: 'POST', csrf: true, body: Object.assign({ id: id, action: action }, extra || {}) }).then(function (r) {
      if (r.status === 200 && r.body.ok) { toast(r.body.emailed || 'Updated.', 'ok'); renderShell(); }
      else toast((r.body && r.body.error) || 'Could not update.', 'err');
      if (done) done();
    }).catch(function () { toast('Network error.', 'err'); if (done) done(); });
  }

  function openResActions(o) {
    var d = o.details || {};
    var body = h('div', {}, [
      h('button', { class: 'btn btn--full btn--ghost', text: 'Reschedule…', onclick: function () {
        var nd = window.prompt('New date (the guest will be emailed):', d.reservation_date || '');
        if (nd == null || !nd.trim()) return;
        m.close(); resAction(o.id, 'reschedule', { new_date: nd.trim() });
      } }),
      h('button', { class: 'btn btn--full btn--danger', style: 'margin-top:10px', text: 'Cancel this reservation', onclick: function () {
        if (!window.confirm('Cancel ' + (o.name || 'this reservation') + (o.email ? ' and email the guest?' : '?'))) return;
        m.close(); resAction(o.id, 'cancel');
      } })
    ]);
    var m = modal((o.name || 'Reservation') + (d.reservation_time ? ' · ' + d.reservation_time : ''), body);
  }

  // Pick a table for a reservation — shows seats and today's occupancy.
  function openSeatPicker(o, tableList, tablesById, day) {
    if (!tableList || !tableList.length) {
      toast('No tables yet — set up your floor plan first.', 'err');
      resView = '__plan'; renderShell(); return;
    }
    var d = o.details || {};
    // table_id → names seated that day
    var seatedBy = {};
    (day && day.reservations || []).forEach(function (r2) {
      var d2 = r2.details || {};
      if (d2.table_id && !d2.cancelled && r2.id !== o.id) {
        (seatedBy[d2.table_id] = seatedBy[d2.table_id] || []).push((r2.name || '?') + (d2.reservation_time ? ' ' + d2.reservation_time : ''));
      }
    });
    var body = h('div', {}, []);
    tableList.forEach(function (t) {
      var busy = seatedBy[t.id] || [];
      body.appendChild(h('button', { class: 'seat-opt' + (d.table_id === t.id ? ' seat-opt--current' : ''), onclick: function () { assign(t.id, false); } }, [
        h('strong', { text: t.name }),
        h('span', { text: t.seats + ' seats' + (busy.length ? ' · also: ' + busy.join(', ') : '') })
      ]));
    });
    if (d.table_id) {
      body.appendChild(h('button', { class: 'btn btn--full btn--ghost', style: 'margin-top:10px', text: 'Unseat (remove table)', onclick: function () { assign(null, true); } }));
    }
    var m = modal('Seat ' + (o.name || 'guest') + (d.party_size ? ' · ' + d.party_size : ''), body);
    function assign(tableId, force) {
      api('reservations', { method: 'POST', csrf: true, body: { action: 'assign', id: o.id, table_id: tableId, force: !!force } }).then(function (r) {
        if (r.status === 409 && r.body.needsForce) {
          if (window.confirm(r.body.warning + '\n\nSeat here anyway?')) assign(tableId, true);
          return;
        }
        if (r.status === 200 && r.body.ok) { m.close(); toast(tableId ? 'Seated.' : 'Unseated.', 'ok'); renderShell(); }
        else toast((r.body && r.body.error) || 'Could not seat.', 'err');
      }).catch(function () { toast('Network error.', 'err'); });
    }
  }

  /* ---- floor plan editor ---- */
  function renderFloorPlan(wrap) {
    api('reservations?sub=tables').then(function (r) {
      wrap.innerHTML = '';
      if (r.status !== 200 || !r.body.ok) { wrap.appendChild(h('div', { class: 'notice', text: (r.body && r.body.error) || 'Could not load the floor plan.' })); return; }
      var tbls = r.body.tables || [];

      var bar = h('div', { class: 'filter-row' }, [
        h('button', { class: 'btn btn--sm', text: '+ Add table', onclick: function () {
          var name = window.prompt('Table name (e.g. T1, Window, Patio 2):', 'T' + (tbls.length + 1));
          if (name == null || !name.trim()) return;
          var seats = parseInt(window.prompt('How many seats?', '2') || '', 10);
          api('reservations?sub=tables', { method: 'POST', csrf: true, body: { action: 'create', table: { name: name.trim(), seats: Number.isFinite(seats) ? seats : 2, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 } } }).then(function (rr) {
            if (rr.status === 200 && rr.body.ok) { toast('Table added — drag it into place.', 'ok'); renderShell(); }
            else toast((rr.body && rr.body.error) || 'Could not add.', 'err');
          });
        } }),
        h('span', { class: 'res-totals', text: 'Drag tables into place · tap a table to edit or remove it' })
      ]);
      wrap.appendChild(bar);

      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 62');
      svg.setAttribute('class', 'floor');
      var floor = h('div', { class: 'card floor-wrap' }, [svg]);
      wrap.appendChild(floor);

      function pctFromEvent(e) {
        var rect = svg.getBoundingClientRect();
        var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        return { x: Math.min(96, Math.max(4, cx / rect.width * 100)), y: Math.min(58, Math.max(4, cy / rect.height * 62)) };
      }

      tbls.forEach(function (t) {
        var g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'floor-table');
        var shapeEl;
        if (t.shape === 'square' || t.shape === 'booth') {
          shapeEl = document.createElementNS(svgNS, 'rect');
          var w = t.shape === 'booth' ? 11 : 8;
          shapeEl.setAttribute('width', w); shapeEl.setAttribute('height', 8);
          shapeEl.setAttribute('x', -w / 2); shapeEl.setAttribute('y', -4);
          shapeEl.setAttribute('rx', 1.4);
        } else {
          shapeEl = document.createElementNS(svgNS, 'circle');
          shapeEl.setAttribute('r', 4.6);
        }
        var label = document.createElementNS(svgNS, 'text');
        label.setAttribute('y', 0.6); label.setAttribute('class', 'floor-name');
        label.textContent = t.name;
        var seats = document.createElementNS(svgNS, 'text');
        seats.setAttribute('y', 3.4); seats.setAttribute('class', 'floor-seats');
        seats.textContent = t.seats + ' pp';
        g.appendChild(shapeEl); g.appendChild(label); g.appendChild(seats);
        function place() { g.setAttribute('transform', 'translate(' + t.x + ',' + (t.y * 0.62) + ')'); }
        place();

        var moved = false;
        function onMove(e) {
          moved = true;
          var p = pctFromEvent(e);
          t.x = p.x; t.y = p.y / 0.62; place(); // store y as 0-100, render into the 0-62 viewBox
          e.preventDefault();
        }
        function onUp() {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          if (moved) {
            api('reservations?sub=tables', { method: 'POST', csrf: true, body: { action: 'update', id: t.id, table: { x: t.x, y: t.y } } });
          } else {
            editTable(t);
          }
        }
        g.addEventListener('pointerdown', function (e) {
          moved = false;
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
          e.preventDefault();
        });
        svg.appendChild(g);
      });

      function editTable(t) {
        var nameIn = h('input', { value: t.name });
        var seatsIn = h('input', { type: 'number', min: 1, max: 30, value: t.seats });
        var shapeSel = h('select', {}, ['round', 'square', 'booth'].map(function (s) {
          var o = h('option', { value: s, text: s.charAt(0).toUpperCase() + s.slice(1) }); if (t.shape === s) o.selected = true; return o;
        }));
        var body = h('div', {}, [
          h('div', { class: 'field' }, [h('label', { text: 'Name' }), nameIn]),
          h('div', { class: 'field-row' }, [
            h('div', { class: 'field' }, [h('label', { text: 'Seats' }), seatsIn]),
            h('div', { class: 'field' }, [h('label', { text: 'Shape' }), shapeSel])
          ]),
          h('button', { class: 'btn btn--full', text: 'Save table', onclick: function () {
            api('reservations?sub=tables', { method: 'POST', csrf: true, body: { action: 'update', id: t.id, table: { name: nameIn.value, seats: seatsIn.value, shape: shapeSel.value } } }).then(function (rr) {
              if (rr.status === 200 && rr.body.ok) { m.close(); toast('Saved.', 'ok'); renderShell(); }
              else toast((rr.body && rr.body.error) || 'Could not save.', 'err');
            });
          } }),
          h('button', { class: 'btn btn--full btn--danger', style: 'margin-top:10px', text: 'Remove this table', onclick: function () {
            if (!window.confirm('Remove ' + t.name + ' from the floor plan?')) return;
            api('reservations?sub=tables', { method: 'POST', csrf: true, body: { action: 'remove', id: t.id } }).then(function (rr) {
              if (rr.status === 200 && rr.body.ok) { m.close(); toast('Removed.', 'ok'); renderShell(); }
              else toast((rr.body && rr.body.error) || 'Could not remove.', 'err');
            });
          } })
        ]);
        var m = modal('Edit ' + t.name, body);
      }

      if (!tbls.length) {
        wrap.appendChild(h('div', { class: 'notice', text: 'No tables yet — tap "+ Add table" to lay out your dining room. Tables you add here become seating options for every reservation.' }));
      }
    });
  }

  /* ---- add / import ---- */
  function renderAddImport(wrap) {
    wrap.innerHTML = '';
    // Manual (phone) booking
    var nameIn = h('input', { placeholder: 'Guest name' });
    var phoneIn = h('input', { type: 'tel', placeholder: '(825) …' });
    var emailIn = h('input', { type: 'email', placeholder: 'guest@email.com (optional)' });
    var dateIn = h('input', { type: 'date' });
    var timeIn = h('input', { placeholder: 'e.g. 7:00 PM' });
    var partyIn = h('input', { type: 'number', min: 1, max: 30, placeholder: '2' });
    var notesIn = h('input', { placeholder: 'Birthday, window seat… (optional)' });
    wrap.appendChild(h('div', { class: 'card' }, [
      h('h3', { class: 'card-title', text: 'Add a reservation (phone / walk-in)' }),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Name' }), nameIn]),
        h('div', { class: 'field' }, [h('label', { text: 'Phone' }), phoneIn])
      ]),
      h('div', { class: 'field' }, [h('label', { text: 'Email' }), emailIn]),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [h('label', { text: 'Date' }), dateIn]),
        h('div', { class: 'field' }, [h('label', { text: 'Time' }), timeIn]),
        h('div', { class: 'field' }, [h('label', { text: 'Guests' }), partyIn])
      ]),
      h('div', { class: 'field' }, [h('label', { text: 'Notes' }), notesIn]),
      h('button', { class: 'btn', text: 'Add reservation', onclick: function () {
        api('reservations', { method: 'POST', csrf: true, body: { action: 'add', reservation: {
          name: nameIn.value, phone: phoneIn.value, email: emailIn.value,
          date: dateIn.value, time: timeIn.value, party: partyIn.value ? partyIn.value + ' guests' : '', notes: notesIn.value
        } } }).then(function (r) {
          if (r.status === 200 && r.body.ok) { toast('Reservation added.', 'ok'); resView = 'upcoming'; renderShell(); }
          else toast((r.body && r.body.error) || 'Could not add.', 'err');
        });
      } })
    ]));

    // Wix CSV import
    var csvIn = h('textarea', { style: 'min-height:140px; font-family:monospace; font-size:0.8rem;', placeholder: 'Paste the CSV here, including the header row…' });
    var importBtn = h('button', { class: 'btn', text: 'Import reservations', onclick: function () {
      if (!csvIn.value.trim()) { toast('Paste the CSV first.', 'err'); return; }
      importBtn.disabled = true; importBtn.textContent = 'Importing…';
      api('reservations', { method: 'POST', csrf: true, body: { action: 'import', csv: csvIn.value } }).then(function (r) {
        if (r.status === 200 && r.body.ok) {
          var extra = [];
          if (r.body.tooOld) extra.push(r.body.tooOld + ' before August skipped');
          if (r.body.skipped) extra.push(r.body.skipped + ' unreadable skipped');
          toast('Imported ' + r.body.imported + ' reservation' + (r.body.imported === 1 ? '' : 's') + (extra.length ? ' (' + extra.join(', ') + ')' : ''), 'ok');
          if (r.body.errors && r.body.errors.length) window.alert('Some rows were skipped:\n\n' + r.body.errors.join('\n'));
          csvIn.value = ''; resView = 'upcoming'; renderShell();
        } else toast((r.body && r.body.error) || 'Import failed.', 'err');
      }).finally(function () { importBtn.disabled = false; importBtn.textContent = 'Import reservations'; });
    } });
    wrap.appendChild(h('div', { class: 'card' }, [
      h('h3', { class: 'card-title', text: 'Import from Wix' }),
      h('p', { class: 'help', text: 'In Wix: Table Reservations → export/download as CSV, open it, copy everything, and paste it below. Guests are NOT emailed — this is a quiet migration.' }),
      h('div', { class: 'field' }, [csvIn]),
      importBtn
    ]));
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
    if (o.details && o.details.cancelled) return h('span', { class: 'chip chip--err', text: 'Cancelled' });
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
    [['all', 'All'], ['reservation', 'Reservations'], ['order', 'Pasta Shop'], ['class', 'Classes'], ['contact', 'Inquiries'], ['wholesale', 'Wholesale']].forEach(function (t) {
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
        if (d.reservation_date) bits.push('Table ' + d.reservation_date + (d.reservation_time ? ' at ' + d.reservation_time : '') + (d.party_size ? ' · ' + d.party_size : ''));
        if (d.pickup_day) bits.push('Pickup ' + d.pickup_day + (d.pickup_time ? ' at ' + d.pickup_time : ''));
        if (d.allergies && d.allergies.toLowerCase() !== 'none') bits.push('Allergies: ' + d.allergies);
        if (d.notes) bits.push(d.notes);
        if (d.message) bits.push(d.message);

        var actions = h('div', { class: 'order-actions' }, []);
        function act(action, label, btnCls, extraBody, confirmMsg) {
          var b = h('button', { class: 'btn btn--sm ' + btnCls, text: label, onclick: function () {
            if (confirmMsg && !window.confirm(confirmMsg)) return;
            var payload = Object.assign({ id: o.id, action: action }, extraBody ? extraBody() : {});
            if (extraBody && payload.__abort) return;
            b.disabled = true;
            api('orders', { method: 'POST', csrf: true, body: payload }).then(function (rr) {
              if (rr.status === 200 && rr.body.ok) { toast(rr.body.emailed || 'Updated.', 'ok'); renderShell(); }
              else { toast((rr.body && rr.body.error) || 'Could not update.', 'err'); b.disabled = false; }
            }).catch(function () { toast('Network error.', 'err'); b.disabled = false; });
          } });
          return b;
        }
        var cancelled = !!d.cancelled;
        var unpaid = (o.payment_status === 'pending' || o.payment_status === 'reminded');
        if (!cancelled && unpaid) actions.appendChild(act('mark_paid', 'Mark paid', 'btn--green'));
        if (!cancelled && unpaid && o.email && o.payment_link_url) {
          actions.appendChild(act('send_reminder', 'Email payment reminder', 'btn--ghost', null,
            'Email ' + (o.name || 'the customer') + ' a payment reminder with their payment link?'));
        }
        var bookable = (o.type === 'order' || o.type === 'class' || o.type === 'reservation');
        if (!cancelled && bookable && (d.class_date || d.reservation_date || d.pickup_day)) {
          actions.appendChild(act('reschedule', 'Reschedule', 'btn--ghost', function () {
            var current = d.class_date || d.reservation_date || d.pickup_day;
            var nd = window.prompt('New date for this booking (the customer will be emailed):', current || '');
            if (nd == null || !nd.trim()) return { __abort: true };
            return { new_date: nd.trim() };
          }));
        }
        if (!cancelled && !(d.fulfilled) && (o.type === 'order' || o.type === 'class')) actions.appendChild(act('mark_fulfilled', 'Mark fulfilled', 'btn--ghost'));
        if (!cancelled && bookable) {
          actions.appendChild(act('cancel', 'Cancel booking', 'btn--danger', null,
            'Cancel this booking' + (o.email ? ' and email ' + (o.name || 'the customer') + '?' : '?')));
        }

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
