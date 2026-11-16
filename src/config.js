import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const HOME = os.homedir();

function expand(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  return p;
}

export const PROFILE = (process.env.AGENT_PROFILE || 'claude').toLowerCase();
export const HOST = process.env.MCP_HOST || '127.0.0.1';
export const PORT = Number(process.env.MCP_PORT || 8790);
export const PROJECT_ROOT = path.resolve(expand(process.env.PROJECT_ROOT || process.cwd()));
export const TIMEOUT_SEC = Number(process.env.AGENT_TIMEOUT_SEC || 300);
export const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').trim();
export const TOKEN_FILE = expand(
  process.env.MCP_TOKEN_FILE || path.join(HOME, '.config', 'agent-cli-mcp', 'token'),
);

const BINS = { claude: 'claude', hermes: 'hermes', grok: 'grok', custom: '' };
export const AGENT_BIN = process.env.AGENT_BIN || BINS[PROFILE] || 'claude';

export function loadToken() {
  const fromEnv = (process.env.MCP_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t) return t;
  } catch {
    /* no file yet */
  }
  return '';
}

export function ensureToken() {
  let t = loadToken();
  if (t) return t;
  t = randomBytes(24).toString('hex');
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_FILE, `${t}\n`, { mode: 0o600 });
  return t;
}
