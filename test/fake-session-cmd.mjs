// Stand-in for a VW_MCP_SESSION_CMD script: hands out the key the fake CLI currently accepts,
// minting a new one only when the vault is locked, the way a real shared-unlock helper would.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const file = path.join(process.env.VW_MCP_HOME, 'bw', 'fake-vault.json');
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
if (process.env.FAKE_SESSION_CMD_FAIL) process.exit(1);
if (!state.session) {
  state.session = randomUUID().replace(/-/g, '') + '==';
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}
process.stdout.write(state.session + '\n');
