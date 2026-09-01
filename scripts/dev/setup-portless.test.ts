import { describe, expect, it } from 'vitest';
import {
  buildPortlessCommand,
  isPortlessServiceReady,
  PORTLESS_SERVICE_INSTALL_ARGS,
} from './setup-portless';

describe('Portless developer setup', () => {
  it('runs the pinned Portless CLI with Node instead of the Bun parent runtime', () => {
    expect(
      buildPortlessCommand(
        ['service', 'status'],
        '/opt/homebrew/bin/node',
        '/repo/node_modules/.bin/portless',
      ),
    ).toEqual([
      '/opt/homebrew/bin/node',
      '/repo/node_modules/.bin/portless',
      'service',
      'status',
    ]);
  });

  it('pins the startup service to the canonical HTTPS contract', () => {
    expect(PORTLESS_SERVICE_INSTALL_ARGS).toEqual([
      'service',
      'install',
      '--https',
      '--port',
      '443',
      '--tld',
      'localhost',
    ]);
  });

  it('accepts the required installed service status', () => {
    expect(
      isPortlessServiceReady(`
        Manager state: running
        Installed: yes
        Proxy on 443: responding
        HTTPS: yes
        TLDs: .localhost
        LAN mode: no
        Wildcard: no
      `),
    ).toBe(true);
  });

  it('rejects an HTTP or non-standard-port service', () => {
    expect(
      isPortlessServiceReady(`
        Manager state: running
        Installed: yes
        Proxy on 1355: responding
        HTTPS: no
        TLDs: .localhost
        LAN mode: no
        Wildcard: no
      `),
    ).toBe(false);
  });

  it('rejects an installed service when the manager is stopped', () => {
    expect(
      isPortlessServiceReady(`
        Manager state: stopped
        Installed: yes
        Proxy on 443: responding
        HTTPS: yes
        TLDs: .localhost
        LAN mode: no
        Wildcard: no
      `),
    ).toBe(false);
  });
});
