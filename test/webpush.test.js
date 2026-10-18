/* Web push (VAPID). What CAN be proven here: a stored subscription produces a
   valid, VAPID-signed, encrypted push request (the exact bytes that would go to
   Android/FCM), and the subscription store round-trips. What only a phone can
   prove — the notification actually appearing — is Erika's to confirm. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../.data/push_subscriptions.json');
function clean() { try { fs.unlinkSync(FILE); } catch (e) {} }
clean();
delete process.env.DATABASE_URL;

const web = require('web-push');
const keys = web.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = 'mailto:info@dacecotfood.com';

const wp = require('../lib/notify/webpush');

let passed = 0;
function ok(name, c) { assert.ok(c, name); passed++; }
function eq(name, a, b) { assert.strictEqual(a, b, name + ' (' + a + ' !== ' + b + ')'); passed++; }

// A realistic subscription: a real P-256 client key so web-push can encrypt to it.
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const sub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-abc123',
  keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') }
};

(async () => {
  eq('configured() true with keys set', wp.configured(), true);
  ok('publicKey() returns the env key', wp.publicKey() === keys.publicKey);

  // store round-trip
  await wp.save(sub);
  let all = await wp.list();
  eq('subscription saved', all.length, 1);
  eq('stored endpoint matches', all[0].endpoint, sub.endpoint);
  await wp.save(sub); // idempotent on endpoint
  eq('re-saving same endpoint does not duplicate', (await wp.list()).length, 1);

  // THE real artifact: the actual request web-push would POST to FCM.
  const details = web.generateRequestDetails(sub, JSON.stringify({ title: 'New reservation', body: 'Anna · 2 · 7:30 PM', link: 'reservations' }), {
    vapidDetails: { subject: process.env.VAPID_SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 3600
  });
  eq('request targets the subscription endpoint', details.endpoint, sub.endpoint);
  ok('VAPID Authorization header present', /vapid/i.test(details.headers.Authorization || ''));
  eq('payload is encrypted (aes128gcm)', details.headers['Content-Encoding'], 'aes128gcm');
  ok('TTL header set', String(details.headers.TTL) === '3600');
  ok('encrypted body is non-empty', details.body && details.body.length > 0);

  // invalid subscriptions are refused
  let threw = false; try { await wp.save({ endpoint: 'nope' }); } catch (e) { threw = true; }
  ok('an invalid subscription is rejected', threw);

  // remove
  await wp.remove(sub.endpoint);
  eq('subscription removed', (await wp.list()).length, 0);

  // with no keys, fanout is inert (never throws)
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  const r = await require('../lib/notify/webpush').fanout({ title: 'x' });
  ok('fanout no-ops when unconfigured', r && r.skipped === true);

  clean();
  console.log('webpush.test.js: ' + passed + ' assertions passed');
})().catch((e) => { clean(); console.error('webpush.test.js FAILED:', e.message); process.exit(1); });
