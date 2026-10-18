/* ============================================================
   da Cecot — notification dispatch: one call, two channels.
   notify(n) writes the bell row (lib/notify/notifications.js) and, when web
   push is configured, fans the same alert out to Erika's subscribed devices
   (lib/notify/webpush.js). Each channel is independent and best-effort: a push
   failure must never lose the bell row, and the bell must never block a booking.
   ============================================================ */
const notifications = require('./notifications');

async function notify(n) {
  let row = null;
  try { row = await notifications.create(n); } catch (e) { console.error('bell notify failed', e && e.message); }
  // Web push — optional. The module may not exist / may be unconfigured; either
  // way the bell already has the alert, so we only log.
  try {
    const push = require('./webpush');
    if (push && typeof push.fanout === 'function') await push.fanout(n);
  } catch (e) {
    if (e && e.code !== 'MODULE_NOT_FOUND') console.error('push fanout failed', e && e.message);
  }
  return row;
}

module.exports = { notify };
