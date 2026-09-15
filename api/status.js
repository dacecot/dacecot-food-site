// GET /api/status — public, aggregate-only. "Is the site taking bookings?"
//
// The site is static, so the Reserve page is built long before Erika decides to
// pause reservations mid-service. This is how the page finds out. It carries no
// guest data and nothing private — only switches a visitor would see anyway by
// trying to book.
//
//   { reservations: { paused: true, until: "…Z", untilLabel: "7:30 PM", minutesLeft: 45 } }
const pause = require('../lib/orders/pause');

// The restaurant's own clock. A guest reading "back at 7:30" wants da Cecot's
// 7:30, not the one in whatever timezone their laptop is set to.
function edmontonTime(iso) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit', hour12: true
    }).format(new Date(iso));
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }

  let reservations = { paused: false, until: null, untilLabel: null, minutesLeft: 0 };
  try {
    const s = await pause.status();
    reservations = Object.assign({}, s, { untilLabel: s.until ? edmontonTime(s.until) : null });
  } catch (e) {
    // Fail open — a status endpoint that errors must not look like a pause.
    console.error('status failed', e && e.message);
  }

  // Short cache only. A pause is meant to take effect while she is still
  // standing there, so this cannot sit in a CDN for a minute.
  res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=20');
  return res.status(200).json({ reservations });
};
