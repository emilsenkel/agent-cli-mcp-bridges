#!/usr/bin/env node
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  AGENT_BIN, HOST, PORT, PROFILE, PROJECT_ROOT, TIMEOUT_SEC, WEBHOOK_URL,
  ensureToken,
} from './config.js';
import { runAgent } from './run-agent.js';

const TOKEN = ensureToken();

function makeServer() {
  const server = new McpServer({ name: 'agent-cli-mcp', version: '1.0.0' });

  server.registerTool(
    'agent_status',
    {
      description:
        'Health/status for the configured agent CLI: profile, binary, default cwd, timeout.',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          profile: PROFILE,
          bin: AGENT_BIN,
          projectRoot: PROJECT_ROOT,
          timeoutSec: TIMEOUT_SEC,
          webhookConfigured: Boolean(WEBHOOK_URL),
        }, null, 2),
      }],
    }),
  );

  server.registerTool(
    'ask_agent',
    {
      description:
        'Run the configured agent CLI headless with a new process. It does not type into a live terminal session.',
      inputSchema: z.object({
        message: z.string().describe('The task or prompt.'),
        cwd: z.string().optional().describe('Working directory (absolute, ~/, or relative to PROJECT_ROOT).'),
        model: z.string().optional(),
        permissionMode: z.string().optional().describe('CLI permission mode when the profile supports it (e.g. plan, acceptEdits).'),
        resumeSessionId: z.string().optional(),
        maxTurns: z.number().int().positive().optional(),
        timeoutSec: z.number().int().positive().optional(),
      }),
    },
    async ({ message, cwd, model, permissionMode, resumeSessionId, maxTurns, timeoutSec }) => {
      const result = await runAgent({
        prompt: message,
        cwd,
        model,
        permissionMode,
        resumeSessionId,
        maxTurns,
        timeoutSec,
      });
      const body = [
        result.ok ? 'ok' : `exit ${result.code}`,
        result.stdout.trim(),
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : '',
      ].filter(Boolean).join('\n\n');
      return { content: [{ type: 'text', text: body }] };
    },
  );

  if (WEBHOOK_URL) {
    server.registerTool(
      'notify',
      {
        description: 'POST { "text": "..." } to the configured WEBHOOK_URL. The tool is omitted when WEBHOOK_URL is unset.',
        inputSchema: z.object({ text: z.string() }),
      },
      async ({ text }) => {
        const r = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        return {
          content: [{ type: 'text', text: `webhook status ${r.status}` }],
        };
      },
    );
  }

  return server;
}

function checkAuth(req, res, next) {
  const hdr = String(req.headers.authorization || '');
  const bearer = hdr.toLowerCase().startsWith('bearer ') ? hdr.slice(7).trim() : '';
  const pathTok = req.params && req.params.token;
  if (bearer === TOKEN || (pathTok && pathTok === TOKEN)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, profile: PROFILE, bin: AGENT_BIN, projectRoot: PROJECT_ROOT });
});

app.all('/mcp', checkAuth, async (req, res) => {
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const sseTransports = new Map();
app.get('/sse', checkAuth, async (req, res) => {
  const server = makeServer();
  const transport = new SSEServerTransport('/messages', res);
  sseTransports.set(transport.sessionId, { server, transport });
  await server.connect(transport);
});
app.post('/messages', checkAuth, async (req, res) => {
  const sid = req.query.sessionId;
  const entry = sseTransports.get(sid);
  if (!entry) return res.status(404).end();
  await entry.transport.handlePostMessage(req, res);
});

// Optional path-token aliases so older clients can use /:token/mcp
app.all('/:token/mcp', checkAuth, async (req, res) => {
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  app.listen(PORT, HOST, () => {
    console.log(
      `agent-cli-mcp (${PROFILE}) on ${HOST}:${PORT}\n` +
        `  streamable: http://${HOST}:${PORT}/mcp\n` +
        `  sse:        http://${HOST}:${PORT}/sse\n` +
        `  project:    ${PROJECT_ROOT}\n` +
        `  bin:        ${AGENT_BIN}\n` +
        `  token file: (not printed)`,
    );
  });
}

export { app, makeServer, checkAuth };
