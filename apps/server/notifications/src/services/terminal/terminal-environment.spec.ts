import { describe, expect, it } from 'vitest';
import { buildTerminalEnvironment } from './terminal-environment';

const SERVER_ENVIRONMENT: Record<string, string> = {
  ANTHROPIC_API_KEY: 'fake-anthropic-key',
  AWS_SECRET_ACCESS_KEY: 'fake-aws-secret',
  BETTER_AUTH_SECRET: 'better-auth-secret-test',
  DATABASE_URL: 'postgresql://db.test/genfeed',
  GENFEEDAI_API_KEY: 'internal-key-test',
  HOME: '/home/operator',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  LOGNAME: 'operator',
  NODE_ENV: 'production',
  NODE_OPTIONS: '--require /tmp/hook.js',
  OPENAI_API_KEY: 'fake-openai-key',
  PATH: '/home/operator/.bun/bin:/usr/bin',
  REDIS_URL: 'redis://redis.test:6379',
  SHELL: '/bin/bash',
  TOKEN_ENCRYPTION_KEY: 'token-key-test',
  TZ: 'Europe/Paris',
  USER: 'operator',
  XDG_CONFIG_HOME: '/home/operator/.config',
};

describe('buildTerminalEnvironment', () => {
  it.each([
    ['HOME', '/home/operator'],
    ['LANG', 'en_US.UTF-8'],
    ['LC_ALL', 'en_US.UTF-8'],
    ['LOGNAME', 'operator'],
    ['SHELL', '/bin/bash'],
    ['TZ', 'Europe/Paris'],
    ['USER', 'operator'],
    ['XDG_CONFIG_HOME', '/home/operator/.config'],
  ])('passes %s through to the shell', (key, value) => {
    expect(buildTerminalEnvironment(SERVER_ENVIRONMENT)[key]).toBe(value);
  });

  it.each([
    'ANTHROPIC_API_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'BETTER_AUTH_SECRET',
    'DATABASE_URL',
    'GENFEEDAI_API_KEY',
    'NODE_OPTIONS',
    'OPENAI_API_KEY',
    'REDIS_URL',
    'TOKEN_ENCRYPTION_KEY',
  ])('keeps the server secret %s out of the shell', (key) => {
    expect(buildTerminalEnvironment(SERVER_ENVIRONMENT)).not.toHaveProperty(
      key,
    );
  });

  it('sets the terminal type and prefixes the common CLI directories to PATH', () => {
    expect(buildTerminalEnvironment(SERVER_ENVIRONMENT)).toMatchObject({
      COLORTERM: 'truecolor',
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/home/operator/.bun/bin:/usr/bin',
      TERM: 'xterm-256color',
    });
  });

  it('omits allowlisted variables the server process does not have', () => {
    expect(buildTerminalEnvironment({})).toEqual({
      COLORTERM: 'truecolor',
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      TERM: 'xterm-256color',
    });
  });
});
