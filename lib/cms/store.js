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

/* ---- What a GitHub failure MEANS ------------------------------------------
   The admin shows this sentence to Erika, who has no way to act on
   `403 {"message":"Resource not accessible by personal access token"}`. Each
   status here is a different thing to go fix, so each gets its own sentence
   naming the fix. The raw body still goes to the server log for us.

   The 403 is the one that actually happens: GitHub lets ANY token read a
   public repo, so the read half of a save succeeds and only the commit is
   refused — which is why this fails at the last step rather than on load. It
   means the token is missing repository write access, not that anything about
   the content was wrong. */
function ghFailure(status, bodyText) {
  const repo = process.env.GITHUB_REPO || 'the site repository';
  const branch = process.env.GITHUB_BRANCH || 'master';
  let msg;
  if (status === 401) {
    msg = 'the site’s GitHub token has expired or been revoked, so the change could not be saved. It needs to be replaced in the Vercel environment (GITHUB_TOKEN).';
  } else if (status === 403) {
    msg = 'the site’s GitHub token is not allowed to write to ' + repo + '. It needs "Contents: Read and write" on that repository (fine-grained token) or the "repo" scope (classic token) — reading is allowed already, which is why this only fails on save.';
  } else if (status === 404) {
    msg = 'GitHub could not find ' + repo + ' on branch ' + branch + '. Check GITHUB_REPO and GITHUB_BRANCH in the Vercel environment.';
  } else if (status === 409 || status === 422) {
    msg = 'the site content changed underneath this save. Reload the page and make the change again.';
  } else {
    msg = 'GitHub returned ' + status + '.';
  }
  // Logged, not shown: the raw body is for us, not for her.
  console.error('GitHub write failed', status, bodyText);
  const err = new Error(msg);
  err.status = status;
  err.github = true;
  return err;
}

/* Can this token actually commit? GitHub reports the token's own access on the
   repository record, so one cheap read answers it without writing anything.
   Used to warn BEFORE Erika types a long edit and loses it at the save.
   Unknown (network down, no token) is reported as unknown, never as broken —
   a false alarm here would have her chasing a token that is fine. */
async function writeAccess() {
  if (backend() !== 'github') return { backend: backend(), ok: true };
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return { backend: 'github', ok: false, reason: 'The site’s GitHub connection is not configured (GITHUB_REPO / GITHUB_TOKEN).' };
  try {
    const r = await fetch('https://api.github.com/repos/' + repo, { headers: ghHeaders(token) });
    if (!r.ok) return { backend: 'github', ok: null, reason: null };
    const j = await r.json();
    const push = !!(j && j.permissions && j.permissions.push);
    if (push) return { backend: 'github', ok: true };
    return {
      backend: 'github',
      ok: false,
      reason: 'Saving is currently blocked: the site’s GitHub token can read ' + repo + ' but not write to it, so changes cannot be published. It needs "Contents: Read and write" on that repository.'
    };
  } catch (e) {
    // Unknown, not broken.
    return { backend: 'github', ok: null, reason: null };
  }
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
  else if (getRes.status !== 404) { throw ghFailure(getRes.status, await getRes.text()); }

  const putRes = await fetch(base, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, content: contentBase64, sha, branch })
  });
  if (!putRes.ok) throw ghFailure(putRes.status, await putRes.text());
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

module.exports = { backend, readContent, writeContent, writeImage, triggerRebuild, writeAccess, ghFailure };
