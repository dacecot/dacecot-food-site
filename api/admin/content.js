// /api/admin/content
//   GET  → schema + current content (auth required)
//   POST → validate + persist a patch (auth + CSRF required)
const auth = require('../../lib/cms/auth');
const store = require('../../lib/cms/store');
const { groups, defaults } = require('../../lib/cms/schema');
const { validatePatch } = require('../../lib/cms/validate');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (!auth.requireAuth(req, res, false)) return;
    const current = Object.assign({}, defaults, store.readContent());
    return res.status(200).json({ groups, content: current, store: store.backend() });
  }

  if (req.method === 'POST') {
    const s = auth.requireAuth(req, res, true);
    if (!s) return;

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const incoming = (body && body.content && typeof body.content === 'object') ? body.content : body;

    let patch;
    try { patch = validatePatch(incoming); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message, field: e.field }); }

    const merged = Object.assign({}, store.readContent(), patch);
    let result;
    try { result = await store.writeContent(merged, { message: 'CMS: update ' + Object.keys(patch).join(', ') }); }
    catch (e) { return res.status(502).json({ error: 'Could not save your changes: ' + (e && e.message || e) }); }

    return res.status(200).json({ ok: true, content: merged, result });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
