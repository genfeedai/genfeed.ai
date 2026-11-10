import { describe, expect, it } from 'vitest';
import {
  buildNodeRepinCommands,
  buildPortlessCommand,
  evaluateServiceCommand,
  isPortlessServiceReady,
  isServiceDisabled,
  needsNodeRepin,
  PORTLESS_LAUNCH_DAEMON_PATH,
  PORTLESS_SERVICE_INSTALL_ARGS,
  planPortlessSetup,
  resolveStableNodePath,
  shouldInstallPortlessService,
  waitForPortlessServiceReady,
} from './setup-portless';

describe('Portless startup-service Node path', () => {
  it('maps a versioned Homebrew Node to the link that follows upgrades', () => {
    expect(
      resolveStableNodePath('/opt/homebrew/Cellar/node/26.13.0_2/bin/node'),
    ).toBe('/opt/homebrew/opt/node/bin/node');
    expect(
      resolveStableNodePath('/usr/local/Cellar/node/26.12.1/bin/node'),
    ).toBe('/usr/local/opt/node/bin/node');
  });

  it('keeps a pinned Homebrew major on its own formula link', () => {
    expect(
      resolveStableNodePath('/opt/homebrew/Cellar/node@24/24.11.0/bin/node'),
    ).toBe('/opt/homebrew/opt/node@24/bin/node');
  });

  it('leaves Node from outside Homebrew unchanged', () => {
    expect(
      resolveStableNodePath('/Users/dev/.nvm/versions/node/v24.1.0/bin/node'),
    ).toBe('/Users/dev/.nvm/versions/node/v24.1.0/bin/node');
  });

  it('re-pins only an installed service that runs another Node', () => {
    const stableNodePath = '/opt/homebrew/opt/node/bin/node';

    expect(
      needsNodeRepin(
        '/opt/homebrew/Cellar/node/26.12.1/bin/node',
        stableNodePath,
      ),
    ).toBe(true);
    expect(needsNodeRepin(stableNodePath, stableNodePath)).toBe(false);
    expect(needsNodeRepin(null, stableNodePath)).toBe(false);
  });

  it('edits the daemon program only after launchd has unloaded it', () => {
    expect(buildNodeRepinCommands('/opt/homebrew/opt/node/bin/node')).toEqual([
      {
        args: [
          'sudo',
          'launchctl',
          'bootout',
          'system',
          PORTLESS_LAUNCH_DAEMON_PATH,
        ],
        expect: 'any',
      },
      {
        args: ['launchctl', 'print', 'system/sh.portless.proxy'],
        expect: 'unloaded',
      },
      {
        args: [
          'sudo',
          '/usr/libexec/PlistBuddy',
          '-c',
          'Set :ProgramArguments:0 /opt/homebrew/opt/node/bin/node',
          PORTLESS_LAUNCH_DAEMON_PATH,
        ],
        expect: 'success',
      },
      {
        args: [
          'sudo',
          'launchctl',
          'bootstrap',
          'system',
          PORTLESS_LAUNCH_DAEMON_PATH,
        ],
        expect: 'success',
      },
      {
        args: ['sudo', 'launchctl', 'enable', 'system/sh.portless.proxy'],
        expect: 'success',
      },
      {
        args: [
          'sudo',
          'launchctl',
          'kickstart',
          '-k',
          'system/sh.portless.proxy',
        ],
        expect: 'success',
      },
    ]);
  });

  it('treats only launchctl not-found as an unloaded service', () => {
    expect(evaluateServiceCommand('unloaded', 113)).toBe('continue');
    expect(evaluateServiceCommand('unloaded', 0)).toBe('still-loaded');
    // e.g. a failed sudo authentication or a launchctl error
    expect(evaluateServiceCommand('unloaded', 1)).toBe('failed');
    expect(evaluateServiceCommand('unloaded', null)).toBe('failed');
  });

  it('stops the repin when a required step fails', () => {
    expect(evaluateServiceCommand('success', 0)).toBe('continue');
    expect(evaluateServiceCommand('success', 1)).toBe('failed');
    expect(evaluateServiceCommand('success', null)).toBe('failed');
    expect(evaluateServiceCommand('any', 1)).toBe('continue');
  });

  it('detects a disabled launchd override for the Portless job only', () => {
    const list = (state: string) => `
	disabled services = {
		"com.openssh.sshd" => enabled
		"sh.portless.proxy" => ${state}
		"sh.portless.proxy.legacy" => disabled
	}`;

    expect(isServiceDisabled(list('disabled'))).toBe(true);
    expect(isServiceDisabled(list('true'))).toBe(true);
    expect(isServiceDisabled(list('enabled'))).toBe(false);
    expect(isServiceDisabled(list('false'))).toBe(false);
    expect(isServiceDisabled('disabled services = {\n}')).toBe(false);
  });

  it('re-enables a healthy service left disabled by a failed repin', () => {
    const stableNodePath = '/opt/homebrew/opt/node/bin/node';
    const healthyStatus = `
        Manager state: running
        Installed: yes
        Proxy on 443: responding
        HTTPS: yes
        TLDs: .localhost
        LAN mode: no
        Wildcard: no
      `;

    expect(planPortlessSetup(healthyStatus, stableNodePath, true)).toEqual({
      enable: true,
      install: false,
      repinTo: null,
    });
    expect(planPortlessSetup(healthyStatus, stableNodePath, false)).toEqual({
      enable: false,
      install: false,
      repinTo: null,
    });
    expect(
      planPortlessSetup(
        healthyStatus,
        '/opt/homebrew/Cellar/node/26.12.1/bin/node',
        false,
      ).repinTo,
    ).toBe(stableNodePath);
  });
});

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
    const readyStatus = `
        Manager state: running
        Installed: yes
        Proxy on 443: responding
        HTTPS: yes
        TLDs: .localhost
        LAN mode: no
        Wildcard: no
      `;

    expect(isPortlessServiceReady(readyStatus)).toBe(true);
    expect(shouldInstallPortlessService(readyStatus)).toBe(false);
  });

  it('installs Portless when no healthy startup service is available', () => {
    expect(shouldInstallPortlessService(null)).toBe(true);
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

  it('waits for the startup service to become ready', async () => {
    const statuses = [
      null,
      `
        Manager state: stopped
        Installed: yes
        Proxy on 443: not responding
        HTTPS: yes
        TLDs: .localhost
        LAN mode: no
        Wildcard: no
      `,
      `
        Manager state: running
        Installed: yes
        Proxy on 443: responding
        HTTPS: yes
        TLDs: .localhost
        LAN mode: no
        Wildcard: no
      `,
    ];
    const sleepCalls: number[] = [];

    await expect(
      waitForPortlessServiceReady(
        () => statuses.shift() ?? null,
        async (milliseconds) => {
          sleepCalls.push(milliseconds);
        },
        3,
        250,
      ),
    ).resolves.toBe(true);
    expect(sleepCalls).toEqual([250, 250]);
  });
});
