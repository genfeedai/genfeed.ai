import { describe, expect, it } from 'vitest';
import {
  buildPortlessClientEnvironment,
  parsePortlessClientCommand,
} from './run-portless-client';

describe('Portless client environment', () => {
  it('injects the Portless CA for local processes without a public route', () => {
    expect(
      buildPortlessClientEnvironment({
        existingEnv: { PORTLESS_STATE_DIR: '/tmp/portless-state' },
        homeDirectory: '/Users/developer',
        pathExists: (candidate) => candidate === '/tmp/portless-state/ca.pem',
      }),
    ).toMatchObject({
      NODE_EXTRA_CA_CERTS: '/tmp/portless-state/ca.pem',
      PORTLESS_STATE_DIR: '/tmp/portless-state',
    });
  });

  it('preserves an explicitly configured CA path', () => {
    const existingEnv = {
      NODE_EXTRA_CA_CERTS: '/etc/ssl/custom-ca.pem',
    };

    expect(
      buildPortlessClientEnvironment({
        existingEnv,
        homeDirectory: '/Users/developer',
        pathExists: () => false,
      }),
    ).toBe(existingEnv);
  });

  it('fails with the setup command when the Portless CA is missing', () => {
    expect(() =>
      buildPortlessClientEnvironment({
        existingEnv: {},
        homeDirectory: '/Users/developer',
        pathExists: () => false,
      }),
    ).toThrow('Run `bun run dev:setup`');
  });

  it('accepts Bun-stripped and explicit argument separators', () => {
    expect(parsePortlessClientCommand(['bun', 'run', 'worker.ts'])).toEqual([
      'bun',
      'run',
      'worker.ts',
    ]);
    expect(
      parsePortlessClientCommand(['--', 'bun', 'run', 'worker.ts']),
    ).toEqual(['bun', 'run', 'worker.ts']);
    expect(() => parsePortlessClientCommand([])).toThrow(
      'run-portless-client.ts',
    );
  });
});
