// POST /api/admin/upload — accept a base64 image data URL, validate it, and
// store it under images/uploads/. Returns the site-relative path.
// (Auth + CSRF required. JPG/PNG/WebP/GIF only, max 3 MB — Vercel caps the
// request body ~4.5 MB, and base64 inflates ~33%.)
const auth = require('../../lib/cms/auth');
const store = require('../../lib/cms/store');
const crypto = require('crypto');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 3 * 1024 * 1024;

function looksLikeImage(buf, mime) {
  if (mime === 'image/jpeg') return buf[0] === 0xFF && buf[1] === 0xD8;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mime === 'image/gif') return buf.slice(0, 3).toString('ascii') === 'GIF';
  if (mime === 'image/webp') return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const s = auth.requireAuth(req, res, true);
  if (!s) return;

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const dataUrl = String(body.data || '');
  const m = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'Expected a base64 image.' });

  const mime = m[1].toLowerCase();
  const ext = EXT[mime];
  if (!ext) return res.status(400).json({ error: 'Only JPG, PNG, WebP or GIF images are allowed.' });

  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (e) { return res.status(400).json({ error: 'That image could not be read.' }); }
  if (!buf.length) return res.status(400).json({ error: 'That image is empty.' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'Please use an image under 3 MB.' });
  if (!looksLikeImage(buf, mime)) return res.status(400).json({ error: 'That file does not look like a valid image.' });

  const hint = String(body.filename || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
  const filename = hint + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;

  let rel;
  try { rel = await store.writeImage(buf, filename, { message: 'CMS: upload ' + filename }); }
  catch (e) { return res.status(502).json({ error: 'Upload failed: ' + (e && e.message || e) }); }

  return res.status(200).json({ ok: true, path: rel });
};
