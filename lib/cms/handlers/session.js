// GET /api/admin/session — report whether the caller has a valid session.
const auth = require('../auth');
const authstore = require('../authstore');

module.exports = (req, res) => {
  const s = auth.getSession(req);
  if (!s) return res.status(200).json({ authed: false, configured: auth.configured() });
  return res.status(200).json({
    authed: true,
    csrf: s.csrf,
    email: process.env.ADMIN_EMAIL || null,
    mustChange: !!s.mustChange,
    canChange: authstore.dbConfigured()
  });
};
