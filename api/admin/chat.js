// /api/admin/chat — AI assistant for the CMS.
//   GET  → { configured } probe (is the assistant switched on?)
//   POST → run a tool-using turn (auth + CSRF required)
// The assistant can read and update the SAME content fields as the forms, going
// through the exact same validation. It is INERT until ANTHROPIC_API_KEY is set,
// so it costs nothing (and can't be used) until spend is approved.
const auth = require('../../lib/cms/auth');
const rl = require('../../lib/cms/ratelimit');
const store = require('../../lib/cms/store');
const { groups, defaults } = require('../../lib/cms/schema');
const { validatePatch } = require('../../lib/cms/validate');

const MODEL = process.env.CMS_ASSISTANT_MODEL || 'claude-sonnet-5'; // override via env
const NOT_CONFIGURED = 'The AI assistant isn’t switched on yet. You can still make every edit using the tabs on the left. (To enable it, your developer sets ANTHROPIC_API_KEY.)';

function fieldCatalogue() {
  const lines = [];
  groups.forEach((g) => {
    lines.push('## ' + g.title);
    g.fields.forEach((f) => {
      var c = '- ' + f.key + ' — ' + f.label + ' (' + f.type;
      if (f.type === 'number') c += ', ' + (f.min != null ? f.min : '') + '–' + (f.max != null ? f.max : '');
      if (f.maxlength) c += ', max ' + f.maxlength + ' chars';
      c += ')';
      lines.push(c);
    });
  });
  return lines.join('\n');
}

const TOOLS = [
  { name: 'get_content', description: 'Get the current value of every editable field.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'update_content',
    description: 'Change one or more editable fields. Pass an object mapping field keys to new values. Lists (like classDates) take an array of strings; toggles take true/false; numbers take a number.',
    input_schema: {
      type: 'object',
      properties: { changes: { type: 'object', description: 'Map of fieldKey → new value.' } },
      required: ['changes']
    }
  }
];

const SYSTEM = [
  'You are the friendly site-manager assistant for the da Cecot Food restaurant website.',
  'You help Erika, a non-technical restaurant owner, edit her website by calling tools.',
  'Only these fields exist — never invent fields. When she asks to change something, map it to the right field key and call update_content. Confirm what you changed in one short, warm sentence.',
  'If a request is ambiguous or would need a field that does not exist, ask a brief clarifying question instead of guessing. Never claim a change was made unless update_content succeeded.',
  'Editable fields:',
  fieldCatalogue()
].join('\n');

async function runTool(name, input) {
  if (name === 'get_content') {
    return { content: Object.assign({}, defaults, store.readContent()) };
  }
  if (name === 'update_content') {
    const changes = (input && input.changes) || {};
    let patch;
    try { patch = validatePatch(changes); }
    catch (e) { return { ok: false, error: e.message }; }
    const merged = Object.assign({}, store.readContent(), patch);
    try {
      const result = await store.writeContent(merged, { message: 'CMS (assistant): update ' + Object.keys(patch).join(', ') });
      return { ok: true, changed: Object.keys(patch), backend: result.backend };
    } catch (e) { return { ok: false, error: 'Could not save: ' + (e && e.message || e) }; }
  }
  return { error: 'Unknown tool' };
}

async function callClaude(key, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools: TOOLS, messages: messages })
  });
  if (!r.ok) { const t = await r.text(); throw new Error('assistant upstream ' + r.status + ': ' + t.slice(0, 300)); }
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ configured: !!process.env.ANTHROPIC_API_KEY, message: NOT_CONFIGURED });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }

  const s = auth.requireAuth(req, res, true);
  if (!s) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ configured: false, message: NOT_CONFIGURED });

  // Light rate limit so the assistant can't be spun in a costly loop.
  const gate = await rl.hit('chat:' + rl.clientIp(req), { limit: 40, windowSec: 300 });
  if (!gate.ok) { res.setHeader('Retry-After', String(gate.retryAfter)); return res.status(429).json({ error: 'Slow down a moment and try again.' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const history = Array.isArray(body && body.messages) ? body.messages : [];
  // Keep only role/content text turns from the client; cap history length.
  const messages = history.slice(-16).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content == null ? '' : m.content) }))
    .filter((m) => m.content.trim() !== '');
  if (!messages.length) return res.status(400).json({ error: 'Nothing to respond to.' });

  const steps = [];
  let changed = false, rebuilding = false;

  try {
    for (let i = 0; i < 5; i++) {
      const resp = await callClaude(key, messages);
      messages.push({ role: 'assistant', content: resp.content });

      const toolUses = (resp.content || []).filter((b) => b.type === 'tool_use');
      if (!toolUses.length) {
        const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return res.status(200).json({ reply: text || 'Done.', steps: steps, changed: changed, rebuilding: rebuilding });
      }

      const results = [];
      for (const tu of toolUses) {
        const out = await runTool(tu.name, tu.input);
        if (tu.name === 'update_content' && out.ok) {
          changed = true;
          if (out.backend === 'github') rebuilding = true;
          steps.push('Updated: ' + out.changed.join(', '));
        } else if (tu.name === 'update_content' && out.error) {
          steps.push('Couldn’t update: ' + out.error);
        }
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      messages.push({ role: 'user', content: results });
    }
    return res.status(200).json({ reply: 'I’ve done what I can — please double-check the tabs.', steps: steps, changed: changed, rebuilding: rebuilding });
  } catch (e) {
    console.error('chat error', e);
    return res.status(502).json({ error: 'The assistant had trouble responding. Please try again, or use the tabs.' });
  }
};
