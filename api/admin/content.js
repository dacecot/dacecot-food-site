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
    // Whether a save would land, asked BEFORE she types the edit. A token that
    // can read but not commit fails only at the last step, which is how a
    // closure notice gets written twice and published never.
    let saving = { ok: null };
    try { saving = await store.writeAccess(); } catch (e) { saving = { ok: null }; }
    return res.status(200).json({ groups, content: current, store: store.backend(), saving });
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
    catch (e) {
      // A GitHub failure already carries a sentence Erika can act on; anything
      // else is ours, so it is logged rather than printed at her.
      if (!(e && e.github)) console.error('content save failed', e && e.stack || e);
      const detail = (e && e.github) ? e.message : 'the site could not reach its content store. Please try again in a minute.';
      return res.status(502).json({ error: 'Could not save your changes: ' + detail });
    }

    return res.status(200).json({ ok: true, content: merged, result });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
