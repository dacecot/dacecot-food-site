/* Notification bell store — create / list / unread / mark-read, plus the
   once-per-day dedupe a cron relies on. Local JSON backend (no DATABASE_URL). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DATA = path.resolve(__dirname, '../.data');
const FILE = path.join(DATA, 'notifications.json');
function clean() { try { fs.unlinkSync(FILE); } catch (e) {} }
clean();
delete process.env.DATABASE_URL; // force local backend

const notify = require('../lib/notify/notifications');

let passed = 0;
function eq(name, a, b) { assert.strictEqual(a, b, name + ' (' + a + ' !== ' + b + ')'); passed++; }
function ok(name, c) { assert.ok(c, name); passed++; }

(async () => {
  await notify.create({ kind: 'reservation', title: 'New reservation', body: 'Anna · 2 guests · 2026-11-08 7:00 PM', link: 'reservations' });
  await notify.create({ kind: 'order', title: 'New pasta-shop order', body: 'Bob', link: 'orders' });
  await notify.create({ kind: 'class', title: 'New class booking', body: 'Cara', link: 'classes' });

  let items = await notify.list({ limit: 10 });
  eq('three notifications listed', items.length, 3);
  eq('newest first', items[0].title, 'New class booking');
  eq('unread count = 3', await notify.unreadCount(), 3);
  ok('items carry their deep-link', items[0].link === 'classes');

  await notify.markRead([items[0].id]);
  eq('unread drops to 2 after one read', await notify.unreadCount(), 2);
  const after = await notify.list({ limit: 10 });
  ok('the read one is flagged read', after.find((x) => x.id === items[0].id).read === true);

  await notify.markAllRead();
  eq('mark-all clears unread', await notify.unreadCount(), 0);

  // once-per-day dedupe (a cron firing repeatedly must not spam the bell)
  const a = await notify.createOncePerDay({ kind: 'class_cutoff', title: 'Class cutoff today' });
  const b = await notify.createOncePerDay({ kind: 'class_cutoff', title: 'Class cutoff today' });
  ok('first createOncePerDay writes', a && a.id);
  ok('second same-day same-kind is skipped', b === null);

  clean();
  console.log('notifications.test.js: ' + passed + ' assertions passed');
})().catch((e) => { clean(); console.error('notifications.test.js FAILED:', e.message); process.exit(1); });
