import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const appPackageJsonPath = path.resolve(import.meta.dir, '../../package.json');
const mainSourcePath = path.resolve(import.meta.dir, '../main.ts');

describe('Desktop preload packaging', () => {
  it('exposes only the runtime getter and event while preserving the shell proxy', () => {
    const preload = fs.readFileSync(
      path.resolve(import.meta.dir, '../preload.ts'),
      'utf8',
    );
    const main = fs.readFileSync(mainSourcePath, 'utf8');
    expect(preload).toContain('getRuntimeContext:');
    expect(preload).toContain('onDidChangeRuntimeContext:');
    expect(preload).toContain('ipcRenderer.removeListener');
    expect(main).toMatch(
      /registerPrivilegedIpcHandler\(\s*DESKTOP_IPC_CHANNELS.appRuntimeContext/,
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: assert the source proxy expression
    expect(preload).toContain('`${appOrigin}/v1`');
  });

  it('guards local IPC, explicit retries and delegated generation before bootstrap reads', () => {
    const main = fs.readFileSync(mainSourcePath, 'utf8');
    expect(main).toMatch(
      /const requireLocalRuntime = \(\): void => \{\s*assertDesktopRuntimeAvailable\(runtimeContextStatus\)/,
    );
    expect(main).toMatch(
      /function getDataService\(\): IDesktopDataService \{\s*return selectDesktopRuntimeDataService/,
    );
    for (const channel of [
      'appEnableOfflineMode',
      'appUseCloudMode',
      'cloudGenerateContent',
    ])
      expect(main).toMatch(
        new RegExp(
          `DESKTOP_IPC_CHANNELS\\.${channel},[\\s\\S]*?async[^\\{]*\\{\\s*assertDesktopRuntimeAvailable\\(runtimeContextStatus\\)`,
        ),
      );
  });

  it('builds a CommonJS preload for the sandboxed renderer', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(appPackageJsonPath, 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };
    const mainSource = fs.readFileSync(mainSourcePath, 'utf8');

    expect(packageJson.scripts?.['build:preload']).toContain('--format=cjs');
    expect(packageJson.scripts?.['build:preload']).toContain(
      '--outfile=dist/preload.cjs',
    );
    expect(mainSource).toContain("preload: path.join(mainDir, 'preload.cjs')");
  });
  it('guards server selection and owns confirmation until the switch finishes', () => {
    const main = fs.readFileSync(mainSourcePath, 'utf8');
    const start = main.indexOf('const switchDesktopServer = async');
    const source = main.slice(start, main.indexOf('\n};', start));
    expect(source.indexOf('assertDesktopServerSwitchAvailable(')).toBeLessThan(
      source.indexOf('dialog.showMessageBox'),
    );
    expect(source).toContain('isDesktopServerSwitchPending = true;');
    expect(source).toMatch(/finally \{\s*isDesktopServerSwitchPending = false/);
    expect(source).toContain('() => runtimeContextStatus,');
  });
});
