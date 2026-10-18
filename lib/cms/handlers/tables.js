// /api/admin/tables — floor-plan tables CRUD (auth required; mutations CSRF).
//   GET  → { tables }
//   POST → { action:'create'|'update'|'remove', id?, table:{name,seats,shape,x,y} }
const auth = require('../auth');
const tables = require('../../orders/tables');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (!auth.requireAuth(req, res, false)) return;
    try {
      const [list, summary] = await Promise.all([tables.list(), tables.statusSummary()]);
      return res.status(200).json({ ok: true, tables: list, summary: summary });
    }
    catch (e) { return res.status(502).json({ error: 'Could not load the floor plan: ' + (e && e.message || e) }); }
  }

  if (req.method === 'POST') {
    if (!auth.requireAuth(req, res, true)) return;
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const action = String(body.action || '');
    const input = (body.table && typeof body.table === 'object') ? body.table : {};
    try {
      if (action === 'create') {
        const t = await tables.create(input);
        return res.status(200).json({ ok: true, table: t });
      }
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ error: 'Missing table id.' });
      if (action === 'update') {
        const t = await tables.update(id, input);
        if (!t) return res.status(404).json({ error: 'Table not found.' });
        return res.status(200).json({ ok: true, table: t });
      }
      if (action === 'remove') {
        const t = await tables.remove(id);
        if (!t) return res.status(404).json({ error: 'Table not found.' });
        return res.status(200).json({ ok: true });
      }
      if (action === 'occupy') {
        const t = await tables.occupy(id, { party: body.party, submissionId: body.submission_id });
        if (!t) return res.status(404).json({ error: 'Table not found.' });
        return res.status(200).json({ ok: true, table: t, summary: await tables.statusSummary() });
      }
      if (action === 'clear') {
        const t = await tables.clear(id);
        if (!t) return res.status(404).json({ error: 'Table not found.' });
        return res.status(200).json({ ok: true, table: t, summary: await tables.statusSummary() });
      }
      return res.status(400).json({ error: "Unknown action. Use 'create', 'update', 'remove', 'occupy' or 'clear'." });
    } catch (e) {
      return res.status(502).json({ error: 'Floor plan update failed: ' + (e && e.message || e) });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
