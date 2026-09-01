/* ============================================================
   da Cecot CMS — content store adapter
   Reads current content from the bundled content.json on disk (fast, reflects
   the last deploy). Writes go to one of two backends:
     - local  : write straight to disk (used for local verification/dev).
     - github : commit content.json / images to the repo via the GitHub API,
                which (with Vercel's Git integration or a deploy hook) rebuilds
                the static site so the change lands in the live HTML.
   Backend is chosen by CMS_STORE, else inferred (github when a token is present
   on Vercel, otherwise local).
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CONTENT_PATH = path.join(ROOT, 'content.json');

function backend() {
  const explicit = process.env.CMS_STORE;
  if (explicit === 'github' || explicit === 'local') return explicit;
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) return 'github';
  return 'local';
}

// Current content — always read from the deployed file on disk.
function readContent() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) { return {}; }
}

function ghHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dacecot-cms',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

// Create/update a single file in the repo (one commit).
async function ghPut(repoPath, contentBase64, message) {
  const repo = process.env.GITHUB_REPO;         // "owner/name"
  const branch = process.env.GITHUB_BRANCH || 'master';
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GitHub store not configured (GITHUB_REPO / GITHUB_TOKEN).');
  const base = 'https://api.github.com/repos/' + repo + '/contents/' + repoPath.split('/').map(encodeURIComponent).join('/');

  let sha;
  const getRes = await fetch(base + '?ref=' + encodeURIComponent(branch), { headers: ghHeaders(token) });
  if (getRes.status === 200) { const j = await getRes.json(); sha = j.sha; }
  else if (getRes.status !== 404) { throw new Error('GitHub read failed: ' + getRes.status + ' ' + (await getRes.text())); }

  const putRes = await fetch(base, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, content: contentBase64, sha, branch })
  });
  if (!putRes.ok) throw new Error('GitHub commit failed: ' + putRes.status + ' ' + (await putRes.text()));
  return putRes.json();
}

// Fire the Vercel deploy hook (if set) so the site rebuilds after a commit.
async function triggerRebuild() {
  const hook = process.env.VERCEL_DEPLOY_HOOK;
  if (!hook || backend() !== 'github') return { triggered: false };
  try {
    const r = await fetch(hook, { method: 'POST' });
    return { triggered: r.ok, status: r.status };
  } catch (e) { return { triggered: false, error: String(e && e.message || e) }; }
}

async function writeContent(obj, meta) {
  const json = JSON.stringify(obj, null, 2) + '\n';
  if (backend() === 'github') {
    await ghPut('content.json', Buffer.from(json, 'utf8').toString('base64'), (meta && meta.message) || 'CMS: update site content');
    const rebuild = await triggerRebuild();
    return { backend: 'github', committed: true, rebuild };
  }
  fs.writeFileSync(CONTENT_PATH, json);
  return { backend: 'local', committed: false };
}

async function writeImage(buffer, filename, meta) {
  const rel = 'images/uploads/' + filename;
  if (backend() === 'github') {
    await ghPut(rel, buffer.toString('base64'), (meta && meta.message) || ('CMS: upload image ' + filename));
    return rel;
  }
  const dir = path.join(ROOT, 'images', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return rel;
}

module.exports = { backend, readContent, writeContent, writeImage, triggerRebuild };
