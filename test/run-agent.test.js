import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildArgv } from '../src/run-agent.js';

test('claude profile puts the prompt on --print and adds the workdir', () => {
  const { args, promptFile } = buildArgv({
    prompt: 'hello',
    cwd: '/tmp',
    permissionMode: 'plan',
    model: 'sonnet',
  });
  assert.equal(promptFile, null);
  assert.ok(args.includes('--print'));
  assert.ok(args.includes('hello'));
  assert.ok(args.includes('--add-dir'));
  assert.ok(args.includes('/tmp'));
  assert.ok(args.includes('sonnet'));
});
