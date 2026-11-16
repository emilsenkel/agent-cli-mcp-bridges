import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENT_BIN, PROFILE, PROJECT_ROOT, TIMEOUT_SEC } from './config.js';

function resolveCwd(cwd) {
  if (!cwd) return PROJECT_ROOT;
  if (cwd.startsWith('~/')) return path.join(os.homedir(), cwd.slice(2));
  if (path.isAbsolute(cwd)) return cwd;
  return path.resolve(PROJECT_ROOT, cwd);
}

/**
 * Build argv for a headless run. The prompt is never placed on argv for the
 * grok profile (it goes through a temp file). Other profiles pass it as a
 * trailing argument or via --print.
 */
export function buildArgv({ prompt, cwd, model, permissionMode, resumeSessionId, maxTurns }) {
  const profile = PROFILE;
  const args = [];

  if (profile === 'claude') {
    args.push('--print', prompt);
    args.push('--permission-mode', permissionMode || 'plan');
    args.push('--add-dir', cwd);
    if (model) args.push('--model', model);
    if (resumeSessionId) args.push('--resume', resumeSessionId);
    if (maxTurns) args.push('--max-turns', String(maxTurns));
    return { args, promptFile: null };
  }

  if (profile === 'hermes') {
    args.push('--print', prompt);
    if (cwd) args.push('--cwd', cwd);
    if (model) args.push('--model', model);
    if (resumeSessionId) args.push('--resume', resumeSessionId);
    return { args, promptFile: null };
  }

  if (profile === 'grok') {
    const promptFile = path.join(os.tmpdir(), `agent-cli-prompt-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, prompt, { mode: 0o600 });
    args.push('--prompt-file', promptFile);
    if (cwd) args.push('--cwd', cwd);
    if (model) args.push('--model', model);
    if (resumeSessionId) args.push('--resume', resumeSessionId);
    return { args, promptFile };
  }

  // custom
  const promptFile = path.join(os.tmpdir(), `agent-cli-prompt-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(promptFile, prompt, { mode: 0o600 });
  const flag = process.env.AGENT_PROMPT_FLAG;
  if (flag) args.push(flag, promptFile);
  else args.push(promptFile);
  return { args, promptFile };
}

export function runAgent({ prompt, cwd, model, permissionMode, resumeSessionId, maxTurns, timeoutSec }) {
  const workdir = resolveCwd(cwd);
  const seconds = Number(timeoutSec || TIMEOUT_SEC);
  const { args, promptFile } = buildArgv({
    prompt, cwd: workdir, model, permissionMode, resumeSessionId, maxTurns,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(AGENT_BIN, args, {
      cwd: workdir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`agent timed out after ${seconds}s`));
    }, seconds * 1000);
    child.on('error', (err) => {
      clearTimeout(timer);
      cleanup(promptFile);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      cleanup(promptFile);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        cwd: workdir,
        bin: AGENT_BIN,
        profile: PROFILE,
      });
    });
  });
}

function cleanup(file) {
  if (!file) return;
  try { fs.unlinkSync(file); } catch { /* ignore */ }
}
