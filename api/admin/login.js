// POST /api/admin/login — verify the admin password, issue a session cookie.
const auth = require('../../lib/cms/auth');
const rl = require('../../lib/cms/ratelimit');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!auth.configured()) {
    return res.status(503).json({ error: 'Admin is not set up yet. Ask your developer to set ADMIN_PASSWORD_HASH and SESSION_SECRET.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Rate-limit by IP to slow brute force.
  const ip = rl.clientIp(req);
  const gate = await rl.hit('login:' + ip, { limit: 5, windowSec: 900 });
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter));
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
  }

  // Optional email gate (if ADMIN_EMAIL is configured).
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && String(body.email || '').trim().toLowerCase() !== adminEmail.trim().toLowerCase()) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const ok = await auth.verifyPassword(body.password);
  if (!ok) return res.status(401).json({ error: adminEmail ? 'Incorrect email or password.' : 'Incorrect password.' });

  const csrf = auth.issueSession(res);
  return res.status(200).json({ ok: true, csrf });
};
