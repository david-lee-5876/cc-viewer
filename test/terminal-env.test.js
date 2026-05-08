import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  KEEP_CLAUDE_NO_FLICKER_ENV,
  prepareEmbeddedShellSpawn,
  stripClaudeNoFlickerUnlessOptedIn,
} from '../lib/terminal-env.js';

const tmpDirs = [];

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ccv-terminal-env-'));
  tmpDirs.push(dir);
  return dir;
}

describe('terminal-env: CLAUDE_CODE_NO_FLICKER handling', () => {
  it('strips inherited CLAUDE_CODE_NO_FLICKER by default', () => {
    const env = { CLAUDE_CODE_NO_FLICKER: '1' };
    stripClaudeNoFlickerUnlessOptedIn(env, {});
    assert.equal(env.CLAUDE_CODE_NO_FLICKER, undefined);
  });

  it('preserves CLAUDE_CODE_NO_FLICKER when explicitly opted in', () => {
    const env = { CLAUDE_CODE_NO_FLICKER: '1' };
    stripClaudeNoFlickerUnlessOptedIn(env, { [KEEP_CLAUDE_NO_FLICKER_ENV]: '1' });
    assert.equal(env.CLAUDE_CODE_NO_FLICKER, '1');
  });

  it('wraps zsh rc so user rc can run before unsetting NO_FLICKER', () => {
    const rcDir = makeTmpDir();
    const homeDir = makeTmpDir();
    const env = { CLAUDE_CODE_NO_FLICKER: '1' };
    const result = prepareEmbeddedShellSpawn('/bin/zsh', env, { rcDir, homeDir, sourceEnv: {} });

    assert.equal(result.command, '/bin/zsh');
    assert.deepEqual(result.args, []);
    assert.equal(result.env.CLAUDE_CODE_NO_FLICKER, undefined);
    assert.equal(result.env.CCV_ORIGINAL_ZDOTDIR, homeDir);
    assert.equal(result.env.ZDOTDIR, rcDir);

    const zshEnvWrapper = readFileSync(join(rcDir, '.zshenv'), 'utf8');
    assert.match(zshEnvWrapper, /source "\$__ccv_original_zdotdir\/\.zshenv"/);
    assert.match(zshEnvWrapper, /export ZDOTDIR="\$__ccv_wrapper_zdotdir"/);

    const zshRcWrapper = readFileSync(join(rcDir, '.zshrc'), 'utf8');
    assert.match(zshRcWrapper, /source "\$__ccv_original_zdotdir\/\.zshrc"/);
    assert.match(zshRcWrapper, /unset CLAUDE_CODE_NO_FLICKER/);
  });

  it('wraps bash with an rcfile that unsets NO_FLICKER after user rc', () => {
    const rcDir = makeTmpDir();
    const homeDir = makeTmpDir();
    const env = { CLAUDE_CODE_NO_FLICKER: '1' };
    const result = prepareEmbeddedShellSpawn('/bin/bash', env, { rcDir, homeDir, sourceEnv: {} });

    assert.equal(result.command, '/bin/bash');
    assert.deepEqual(result.args, ['--rcfile', join(rcDir, 'bashrc'), '-i']);
    assert.equal(result.env.CLAUDE_CODE_NO_FLICKER, undefined);
    assert.equal(result.env.CCV_ORIGINAL_BASHRC, join(homeDir, '.bashrc'));

    const wrapper = readFileSync(join(rcDir, 'bashrc'), 'utf8');
    assert.match(wrapper, /CCV_ORIGINAL_BASHRC/);
    assert.match(wrapper, /unset CLAUDE_CODE_NO_FLICKER/);
  });

  it('leaves shell startup unchanged when NO_FLICKER keep opt-in is set', () => {
    const rcDir = makeTmpDir();
    const homeDir = makeTmpDir();
    const env = {
      CLAUDE_CODE_NO_FLICKER: '1',
      [KEEP_CLAUDE_NO_FLICKER_ENV]: '1',
    };
    const result = prepareEmbeddedShellSpawn('/bin/zsh', env, { rcDir, homeDir, sourceEnv: {} });

    assert.equal(result.env.CLAUDE_CODE_NO_FLICKER, '1');
    assert.equal(result.env.ZDOTDIR, undefined);
    assert.deepEqual(result.args, []);
  });
});
