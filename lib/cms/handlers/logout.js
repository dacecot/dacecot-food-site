// POST /api/admin/logout — clear the session cookie.
const auth = require('../auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  auth.clearSession(res);
  return res.status(200).json({ ok: true });
};
