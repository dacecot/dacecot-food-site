// GET /api/class-availability — public, aggregate-only (no guest data).
// Returns how many seats remain for each Sunday pasta class so the booking
// page can show a live ticker and block sold-out dates.
//   { max: 12, dates: { "Sunday, September 20, 2026": { booked: 7, left: 5 } } }
const store = require('../lib/orders/store');

function classMax() {
  try {
    const content = require('../lib/cms/content');
    const n = Number(content.get('classMax'));
    if (Number.isFinite(n) && n > 0) return n;
  } catch (e) {}
  return 12;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    await store.init();
    const max = classMax();
    const all = await store.list({ type: 'class' });
    const dates = {};
    for (const s of all) {
      const d = s.details || {};
      if (d.cancelled) continue;
      const date = String(d.class_date || '').trim();
      if (!date) continue;
      const guests = parseInt(String(d.guests || '').replace(/[^\d]/g, ''), 10) || 1;
      if (!dates[date]) dates[date] = { booked: 0, left: max };
      dates[date].booked += guests;
      dates[date].left = Math.max(0, max - dates[date].booked);
    }
    // Small cache so a burst of visitors doesn't hammer the DB; still near-live.
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res.status(200).json({ max: max, dates: dates });
  } catch (e) {
    console.error('class-availability failed', e && e.message);
    // Fail open: the booking form still works; the server enforces the cap on submit.
    return res.status(200).json({ max: classMax(), dates: {} });
  }
};
