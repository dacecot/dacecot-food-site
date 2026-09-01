// POST /api/admin/password — change the admin password (auth + CSRF required).
// Verifies the current password, stores a bcrypt hash of the new one in the
// database, and re-issues a clean session. Plaintext is never stored.
const auth = require('../../lib/cms/auth');
const authstore = require('../../lib/cms/authstore');
const rl = require('../../lib/cms/ratelimit');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const s = auth.requireAuth(req, res, true);
  if (!s) return;

  const gate = await rl.hit('pwchange:' + rl.clientIp(req), { limit: 5, windowSec: 900 });
  if (!gate.ok) { res.setHeader('Retry-After', String(gate.retryAfter)); return res.status(429).json({ error: 'Too many attempts — please wait a few minutes.' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const current = await authstore.verify(body.current);
  if (!current.ok) return res.status(401).json({ error: 'Your current password is incorrect.' });

  try { await authstore.setPassword(body.next); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const csrf = auth.issueSession(res, { mustChange: false });
  return res.status(200).json({ ok: true, csrf });
};
