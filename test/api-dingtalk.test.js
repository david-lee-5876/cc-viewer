import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Isolate LOG_DIR (dingtalk config shares preferences.json) before any findcc-loading import.
const tmpDir = mkdtempSync(join(tmpdir(), 'ccv-dingtalk-api-test-'));
process.env.CCV_LOG_DIR = tmpDir;
process.env.CLAUDE_CONFIG_DIR = tmpDir;
process.env.CCV_WORKSPACE_MODE = '1';
process.env.CCV_CLI_MODE = '0';

// Stub the bridge's outbound fetch so /test never touches the network.
const bridge = await import('../server/lib/dingtalk-bridge.js');
bridge.__setFetchForTests(async (url) => {
  if (url.includes('accessToken')) return { ok: true, json: async () => ({ accessToken: 'tok', expireIn: 7200 }) };
  return { ok: true, json: async () => ({}) };
});

function httpRequest(port, path, { method = 'GET', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, json() { return JSON.parse(data); } }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

describe('DingTalk config API (loopback=admin)', { concurrency: false }, () => {
  let stopViewer, getPort, port;

  before(async () => {
    const mod = await import('../server/server.js');
    stopViewer = mod.stopViewer;
    getPort = mod.getPort;
    assert.ok(await mod.startViewer(), 'server should start');
    port = getPort();
    assert.ok(port > 0);
  });

  after(async () => {
    await new Promise((resolve) => { stopViewer(); setTimeout(() => { rmSync(tmpDir, { recursive: true, force: true }); resolve(); }, 200); });
  });

  it('GET /api/dingtalk/status defaults to disabled (local admin gets an empty appSecret)', async () => {
    const res = await httpRequest(port, '/api/dingtalk/status');
    assert.equal(res.status, 200);
    const d = res.json();
    assert.equal(d.enabled, false);
    assert.equal(d.hasSecret, false);
    // Loopback HTTP is always isLocal:true (admin) → appSecret is present but empty when none is stored.
    assert.equal(d.appSecret, '', 'local admin gets the plaintext appSecret (empty when unset)');
    assert.ok(d.connection && typeof d.connection === 'object', 'includes live connection status');
  });

  it('POST /api/dingtalk/config saves creds and returns masked state', async () => {
    const res = await httpRequest(port, '/api/dingtalk/config', {
      method: 'POST',
      body: { enabled: false, appKey: 'dk123', appSecret: 'topsecret', allowStaffIds: ['u1', 'u2'], maxChunkChars: 2000 },
    });
    assert.equal(res.status, 200);
    const d = res.json();
    assert.equal(d.appKey, 'dk123');
    assert.equal(d.hasSecret, true);
    assert.equal('appSecret' in d, false);
    assert.deepEqual(d.allowStaffIds, ['u1', 'u2']);
    assert.equal(d.maxChunkChars, 2000);
    assert.ok(!res.body.includes('topsecret'), 'secret must not leak in the response');
  });

  it('preserves the secret when re-saving with an empty appSecret', async () => {
    const res = await httpRequest(port, '/api/dingtalk/config', { method: 'POST', body: { enabled: false, appKey: 'dk999', appSecret: '' } });
    assert.equal(res.json().hasSecret, true, 'empty secret must preserve the stored one');
    assert.equal(res.json().appKey, 'dk999');
  });

  it('GET /api/preferences strips the dingtalk key (no secret leak)', async () => {
    const res = await httpRequest(port, '/api/preferences');
    assert.equal('dingtalk' in res.json(), false, 'dingtalk must be stripped from preferences');
    assert.ok(!res.body.includes('topsecret') && !res.body.includes(Buffer.from('topsecret').toString('base64')), 'no secret (raw or base64) in preferences');
  });

  it('POST /api/dingtalk/test validates creds via the stubbed token fetch', async () => {
    const res = await httpRequest(port, '/api/dingtalk/test', { method: 'POST', body: { appKey: 'dk123', appSecret: 'topsecret' } });
    assert.equal(res.status, 200);
    assert.equal(res.json().ok, true);
  });
});

// GET /api/dingtalk/status: a token-authorized LAN (non-local) client must not see the appKey,
// the staffId allowlist, the bound conversation id, or raw errors. Direct handler call since
// loopback HTTP is always isLocal:true.
describe('GET /api/dingtalk/status loopback gate', () => {
  it('strips appKey / allowlist / boundConversationId / lastError for remote callers', async () => {
    const { dingtalkRoutes } = await import('../server/routes/dingtalk.js');
    const { saveDingTalkConfig } = await import('../server/lib/dingtalk-config.js');
    saveDingTalkConfig({ enabled: true, appKey: 'dkSECRET', appSecret: 'appSecretSECRET', allowStaffIds: ['staff-x'] });
    const route = dingtalkRoutes.find((r) => r.path === '/api/dingtalk/status' && r.method === 'GET');
    const deps = { dingtalk: { getBridgeStatus: () => ({ running: true, connected: true, boundConversationId: 'cidSECRET', appKeyTail: 'CRET', lastError: 'boom' }) } };
    const mkRes = () => { let payload = ''; return { writeHead() {}, end(b) { payload = b || ''; }, get payload() { return payload; } }; };

    const remote = mkRes();
    route.handler({}, remote, { pathname: '/api/dingtalk/status' }, /* isLocal */ false, deps);
    const rd = JSON.parse(remote.payload);
    assert.equal(rd.enabled, true);
    assert.equal(rd.hasSecret, true);
    assert.deepEqual(rd.connection, { running: true, connected: true });
    for (const leak of ['dkSECRET', 'appSecretSECRET', 'staff-x', 'cidSECRET', 'CRET', 'boom']) {
      assert.ok(!remote.payload.includes(leak), `remote payload must not leak ${leak}`);
    }
    assert.equal('appKey' in rd, false);
    assert.equal('appSecret' in rd, false, 'remote must never receive the plaintext appSecret');
    assert.equal('allowStaffIds' in rd, false);

    // local caller (admin) gets the full admin view INCLUDING the plaintext appSecret to view/copy
    const local = mkRes();
    route.handler({}, local, { pathname: '/api/dingtalk/status' }, /* isLocal */ true, deps);
    const ld = JSON.parse(local.payload);
    assert.equal(ld.appKey, 'dkSECRET');
    assert.equal(ld.appSecret, 'appSecretSECRET', 'local admin gets the plaintext appSecret');
    assert.deepEqual(ld.allowStaffIds, ['staff-x']);
    assert.equal(ld.connection.boundConversationId, 'cidSECRET');
  });
});

// Loopback HTTP is always isLocal:true, so the !isLocal 403 guard can't be hit via the API.
// Cover it with a direct handler call (mirrors the auth test).
describe('POST /api/dingtalk/config loopback-only guard', () => {
  it('rejects a remote caller with 403 before reading the body', async () => {
    const { dingtalkRoutes } = await import('../server/routes/dingtalk.js');
    const route = dingtalkRoutes.find((r) => r.path === '/api/dingtalk/config' && r.method === 'POST');
    let status = 0, payload = '';
    const res = { writeHead(s) { status = s; }, end(b) { payload = b || ''; } };
    let reloaded = false;
    const deps = { MAX_POST_BODY: 1e6, dingtalk: { reloadBridge() { reloaded = true; }, getBridgeStatus: () => ({}) } };
    route.handler({ on() {} }, res, { pathname: '/api/dingtalk/config' }, /* isLocal */ false, deps);
    assert.equal(status, 403);
    assert.match(payload, /Loopback only/);
    assert.equal(reloaded, false, 'must not reload bridge for a remote caller');
  });
});
