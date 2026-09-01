// /api/admin/auth — consolidated auth endpoint (login, logout, session,
// password) selected by ?action=…. One serverless function instead of four
// (Vercel Hobby caps deployments at 12 functions).
const login = require('../../lib/cms/handlers/login');
const logout = require('../../lib/cms/handlers/logout');
const session = require('../../lib/cms/handlers/session');
const password = require('../../lib/cms/handlers/password');

module.exports = async (req, res) => {
  const qs = (req.url || '').split('?')[1] || '';
  const action = (/(?:^|&)action=([a-z]+)/.exec(qs) || [])[1] || '';
  if (action === 'login') return login(req, res);
  if (action === 'logout') return logout(req, res);
  if (action === 'session') return session(req, res);
  if (action === 'password') return password(req, res);
  return res.status(404).json({ error: 'Unknown auth action.' });
};
