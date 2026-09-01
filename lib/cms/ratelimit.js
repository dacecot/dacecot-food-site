/* ============================================================
   da Cecot CMS — login rate limiter
   Uses Upstash Redis (REST) when configured — durable across serverless
   invocations — and falls back to a per-instance in-memory bucket otherwise
   (best-effort; still slows a burst against a single warm lambda).
   ============================================================ */
const buckets = new Map();

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Register a hit for `key`. Returns { ok, remaining, retryAfter }.
async function hit(key, opts) {
  const limit = (opts && opts.limit) || 5;
  const windowSec = (opts && opts.windowSec) || 900; // 15 min
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const r = await fetch(url + '/pipeline', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify([['INCR', 'rl:' + key], ['EXPIRE', 'rl:' + key, String(windowSec), 'NX']])
      });
      if (r.ok) {
        const j = await r.json();
        const count = Array.isArray(j) ? Number(j[0].result) : Number(j.result);
        return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter: windowSec };
      }
    } catch (e) { /* fall through to in-memory */ }
  }

  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowSec * 1000 }; }
  b.count++;
  buckets.set(key, b);
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfter: Math.ceil((b.reset - now) / 1000) };
}

module.exports = { hit, clientIp };
