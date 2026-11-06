import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { unlocked, ROOT } from '../helpers/server.mjs';

const GITHUB = '11111111-1111-4111-8111-111111111111';
const SESSION_CMD = JSON.stringify([process.execPath, path.join(ROOT, 'test', 'fake-session-cmd.mjs')]);

function patchVault(s, patch) {
  const file = path.join(s.bwDir, 'fake-vault.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...state, ...patch }, null, 2));
}

test('a key retired by another instance is replaced through the session command', async (t) => {
  const s = await unlocked({ env: { VW_MCP_SESSION_CMD: SESSION_CMD } });
  t.after(() => s.close());

  // Another instance on the machine unlocked again, which retires this process's key.
  patchVault(s, { session: 'someone-elses-key==' });

  const { result, json } = await s.callJson('vault_get_item', { id: GITHUB });
  assert.equal(result.isError, undefined, JSON.stringify(json));
  assert.match(JSON.stringify(json), /GitHub/);
  assert.match(s.logText(), /session_recovered/);
});

test('a vault locked by another instance is reopened, and status says so', async (t) => {
  const s = await unlocked({ env: { VW_MCP_SESSION_CMD: SESSION_CMD } });
  t.after(() => s.close());

  patchVault(s, { session: null });
  const read = await s.callJson('vault_get_item', { id: GITHUB });
  assert.equal(read.result.isError, undefined, JSON.stringify(read.json));
  assert.equal((await s.callJson('vault_status')).json.data.state, 'unlocked');
  assert.match(s.logText(), /session_recovered/);
});

test('without a session command a retired key still fails as locked', async (t) => {
  const s = await unlocked();
  t.after(() => s.close());

  patchVault(s, { session: 'someone-elses-key==' });
  const { result, json } = await s.callJson('vault_get_item', { id: GITHUB });
  assert.equal(result.isError, true);
  assert.match(json.error, /locked/i);
});

test('a failing session command leaves the call failing as locked', async (t) => {
  const s = await unlocked({ env: { VW_MCP_SESSION_CMD: SESSION_CMD, FAKE_SESSION_CMD_FAIL: '1' } });
  t.after(() => s.close());

  patchVault(s, { session: 'someone-elses-key==' });
  const { result, json } = await s.callJson('vault_get_item', { id: GITHUB });
  assert.equal(result.isError, true);
  assert.match(json.error, /locked/i);
});

async function exitAndRead(s) {
  await s.client.close().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 1500));
  return JSON.parse(fs.readFileSync(path.join(s.bwDir, 'fake-vault.json'), 'utf8'));
}

test('by default the CLI is locked when the server exits', async () => {
  const s = await unlocked();
  const state = await exitAndRead(s);
  assert.equal(state.session, null);
  await s.close();
});

test('VW_MCP_KEEP_UNLOCKED_ON_EXIT leaves the shared CLI unlocked for other instances', async () => {
  const s = await unlocked({ env: { VW_MCP_KEEP_UNLOCKED_ON_EXIT: '1' } });
  const before = s.vault().session;
  assert.ok(before);
  const state = await exitAndRead(s);
  assert.equal(state.session, before);
  await s.close();
});
