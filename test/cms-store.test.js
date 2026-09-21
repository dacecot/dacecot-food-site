/* ============================================================
   da Cecot — tests for the CMS store's GitHub half.

   Saving site content is a commit to GitHub. When that fails, two things have
   to be true, and neither is about the content:

     1. Erika is told what to DO. The real failure in the wild was
        `403 {"message":"Resource not accessible by personal access token"}`
        printed at her — a sentence she cannot act on and cannot even report
        accurately. Every status maps to the thing that actually needs fixing.

     2. The raw API body never reaches the browser. It is log material.

   Plus the pre-flight: a token that can READ a public repo but not write to it
   fails only at the last step, so the admin asks first. That question is what
   writeAccess() answers, and it must answer "unknown" rather than "broken"
   when it cannot tell — a false alarm sends her chasing a healthy token.

   Plain node — no test framework, no dependencies. Run: npm test
   ============================================================ */

const assert = require('assert');

// Force the github backend before the module is loaded; every test below is
// about the path that commits, not the one that writes to disk.
process.env.GITHUB_REPO = 'haruun-beep/dacecot-food-site';
process.env.GITHUB_TOKEN = 'ghp_TEST_NEVER_USED';
process.env.GITHUB_BRANCH = 'master';
process.env.CMS_STORE = 'github';

const store = require('../lib/cms/store');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}
async function check(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failures.push({ name, message: e && e.message }); }
}

// ghFailure logs the raw body on purpose; keep the test output readable.
const realError = console.error;
console.error = () => {};

const RAW_403 = '{"message":"Resource not accessible by personal access token","documentation_url":"https://docs.github.com/rest/repos/contents#create-or-update-file-contents","status":"403"}';

/* ---------------------------------------------------------------
   What a failure says
   --------------------------------------------------------------- */

test('403 is named as a token permission problem, not a content problem', () => {
  const e = store.ghFailure(403, RAW_403);
  assert.ok(/Contents: Read and write/.test(e.message), 'the fix is not named: ' + e.message);
  assert.ok(e.message.indexOf('haruun-beep/dacecot-food-site') > -1, 'the repository is not named');
  assert.strictEqual(e.status, 403);
  assert.strictEqual(e.github, true, 'the caller cannot tell this apart from a crash');
});

test('the raw GitHub body never travels with the error', () => {
  const e = store.ghFailure(403, RAW_403);
  assert.ok(e.message.indexOf('documentation_url') < 0, 'the API body leaked into the message');
  assert.ok(e.message.indexOf('Resource not accessible') < 0, 'the API body leaked into the message');
  assert.ok(e.message.indexOf('{') < 0, 'JSON leaked into a sentence meant for a person');
});

test('401 sends her to the token, 404 to the repo and branch', () => {
  const expired = store.ghFailure(401, '{"message":"Bad credentials"}');
  assert.ok(/GITHUB_TOKEN/.test(expired.message), 'a dead token must name itself: ' + expired.message);

  const missing = store.ghFailure(404, '{"message":"Not Found"}');
  assert.ok(/GITHUB_BRANCH/.test(missing.message) && /master/.test(missing.message),
    'a wrong repo or branch must say which settings to check: ' + missing.message);
});

test('a clash tells her to reload rather than to go fix infrastructure', () => {
  [409, 422].forEach((s) => {
    const e = store.ghFailure(s, '{"message":"conflict"}');
    assert.ok(/[Rr]eload/.test(e.message), s + ' should ask for a reload: ' + e.message);
    assert.ok(!/token/.test(e.message), s + ' is not a token problem: ' + e.message);
  });
});

test('an unmapped status still produces a sentence, not an empty error', () => {
  const e = store.ghFailure(500, 'upstream exploded');
  assert.ok(e.message.length > 0 && e.message.indexOf('500') > -1);
  assert.ok(e.message.indexOf('upstream exploded') < 0, 'the body leaked');
});

/* ---------------------------------------------------------------
   The pre-flight: would a save land at all?
   --------------------------------------------------------------- */

const realFetch = global.fetch;
const stubFetch = (impl) => { global.fetch = impl; };

async function accessTests() {
  await check('a token that can only read is reported as blocked, with the fix', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ permissions: { admin: false, push: false, pull: true } }) }));
    const r = await store.writeAccess();
    assert.strictEqual(r.ok, false, 'read-only access must not read as healthy');
    assert.ok(/Contents: Read and write/.test(r.reason), 'the warning does not say what to change: ' + r.reason);
  });

  await check('a token that can commit is reported healthy and silent', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ permissions: { admin: true, push: true, pull: true } }) }));
    const r = await store.writeAccess();
    assert.strictEqual(r.ok, true);
    assert.ok(!r.reason, 'a healthy token must not put a warning on her screen');
  });

  await check('an unreachable GitHub is unknown, never blocked', async () => {
    stubFetch(async () => { throw new Error('network down'); });
    const r = await store.writeAccess();
    assert.strictEqual(r.ok, null, 'a network blip must not be reported as a broken token');
    assert.ok(!r.reason);

    stubFetch(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    const bad = await store.writeAccess();
    assert.strictEqual(bad.ok, null, 'a 5xx from GitHub says nothing about the token');
  });

  await check('a missing token is blocked before any request is made', async () => {
    const token = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    stubFetch(async () => { throw new Error('writeAccess must not call GitHub without a token'); });
    const r = await store.writeAccess();
    process.env.GITHUB_TOKEN = token;
    assert.strictEqual(r.ok, false);
    assert.ok(/GITHUB_TOKEN/.test(r.reason), r.reason);
  });

  await check('the local backend always saves, so it never warns', async () => {
    process.env.CMS_STORE = 'local';
    const r = await store.writeAccess();
    process.env.CMS_STORE = 'github';
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.backend, 'local');
  });

  global.fetch = realFetch;
}

accessTests().then(finish).catch((e) => {
  failures.push({ name: 'write-access harness', message: e && e.message });
  finish();
});

function finish() {
  console.error = realError;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + passed + ' passed\n');
    failures.forEach((f) => console.error('  ✗ ' + f.name + '\n      ' + f.message));
    process.exit(1);
  }
  console.log('✓ ' + passed + ' CMS store tests passed');
}
