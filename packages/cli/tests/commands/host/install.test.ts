import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NATIVE_HOST_NAME } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  readHostConfig,
  resolveHostPaths,
  writeHostConfig,
} from '../../../src/commands/host/config';
import {
  deriveExtensionId,
  EXTENSION_MANIFEST_PUBLIC_KEY,
} from '../../../src/commands/host/extension-identity';
import {
  browserUserDataDirectory,
  buildHostManifest,
  installHost,
  manifestPath,
  readInstalledManifests,
  renderLauncher,
  resolveLauncherTarget,
  toHostPlatform,
  uninstallHost,
} from '../../../src/commands/host/install';
import { makeTemporaryDirectory, writeExecutable } from './fixtures';

const run = promisify(execFile);
const PINNED = deriveExtensionId(EXTENSION_MANIFEST_PUBLIC_KEY);

describe('browser manifest locations', () => {
  it.each([
    ['chrome', 'darwin', '/h/Library/Application Support/Google/Chrome'],
    ['chromium', 'darwin', '/h/Library/Application Support/Chromium'],
    ['brave', 'darwin', '/h/Library/Application Support/BraveSoftware/Brave-Browser'],
    ['edge', 'darwin', '/h/Library/Application Support/Microsoft Edge'],
    ['chrome', 'linux', '/h/.config/google-chrome'],
    ['chromium', 'linux', '/h/.config/chromium'],
    ['brave', 'linux', '/h/.config/BraveSoftware/Brave-Browser'],
    ['edge', 'linux', '/h/.config/microsoft-edge'],
  ] as const)('%s on %s', (browser, platform, expected) => {
    expect(browserUserDataDirectory(browser, platform, '/h')).toBe(expected);
    expect(manifestPath(browser, platform, '/h')).toBe(
      `${expected}/NativeMessagingHosts/${NATIVE_HOST_NAME}.json`
    );
  });

  it('supports macOS and Linux only', () => {
    expect(toHostPlatform('darwin')).toBe('darwin');
    expect(() => toHostPlatform('win32')).toThrow(/macOS and Linux/);
  });
});

describe('host manifest', () => {
  it('registers a stdio host for the allowed extensions only', () => {
    expect(
      buildHostManifest('/h/.gf/host/genfeed-host', [PINNED, 'abcdefghijklmnopabcdefghijklmnop'])
    ).toEqual({
      allowed_origins: [
        `chrome-extension://${PINNED}/`,
        'chrome-extension://abcdefghijklmnopabcdefghijklmnop/',
      ],
      description: expect.any(String),
      name: 'ai.genfeed.host',
      path: '/h/.gf/host/genfeed-host',
      type: 'stdio',
    });
  });
});

describe('launcher', () => {
  it('quotes every path so none is read as shell syntax and passes Chrome its arguments through', async () => {
    const directory = await makeTemporaryDirectory();
    const runtimeDirectory = path.join(directory, "it's a dir; touch pwned #");
    const runtime = await writeExecutable(
      runtimeDirectory,
      'runtime',
      `printf '%s\\n' "$@" > "${directory}/argv"\nprintf '%s' "$PATH" > "${directory}/path"`
    );
    const script = path.join(runtimeDirectory, 'gf entry.js');
    await writeFile(script, '');
    const launcher = path.join(directory, 'genfeed-host');
    await writeFile(launcher, renderLauncher({ runtime, script }, "/odd dir/bin:/it's/bin"), {
      mode: 0o755,
    });

    await run(launcher, ['chrome-extension://abc/']);

    expect((await readFile(path.join(directory, 'argv'), 'utf8')).split('\n').slice(0, 4)).toEqual([
      script,
      'host',
      'serve',
      'chrome-extension://abc/',
    ]);
    expect(await readFile(path.join(directory, 'path'), 'utf8')).toBe("/odd dir/bin:/it's/bin");
    await expect(stat(path.join(directory, 'pwned'))).rejects.toThrow();
  });

  it('runs a single binary without a script', () => {
    expect(renderLauncher({ runtime: '/usr/local/bin/gf', script: null }, '/bin')).toContain(
      'exec \'/usr/local/bin/gf\' host serve "$@"'
    );
    expect(resolveLauncherTarget('/usr/local/bin/gf', '/$bunfs/root/gf')).toEqual({
      runtime: '/usr/local/bin/gf',
      script: null,
    });
    expect(resolveLauncherTarget('/usr/local/bin/gf', undefined).script).toBeNull();
  });

  it('refuses a transient npx copy', () => {
    expect(() =>
      resolveLauncherTarget('/usr/bin/node', '/h/.npm/_npx/abc/node_modules/.bin/gf')
    ).toThrow(/globally/);
  });
});

describe('install, status and uninstall', () => {
  async function prepare() {
    const home = await makeTemporaryDirectory();
    return { home, paths: resolveHostPaths(home) };
  }
  const target = { runtime: '/usr/bin/node', script: '/opt/gf/dist/index.js' };

  it('registers every browser whose profile exists, and records the allowed origins', async () => {
    const { home, paths } = await prepare();
    await mkdir(browserUserDataDirectory('brave', 'darwin', home), { recursive: true });
    await mkdir(browserUserDataDirectory('chrome', 'darwin', home), { recursive: true });

    const report = await installHost({
      browsers: null,
      extraExtensionIds: ['abcdefghijklmnopabcdefghijklmnop'],
      homeDirectory: home,
      paths,
      pathValue: '/usr/bin:/bin',
      platform: 'darwin',
      target,
    });

    expect(report.manifests.map((m) => m.browser)).toEqual(['chrome', 'brave']);
    expect(report.skippedBrowsers).toEqual(['chromium', 'edge']);
    const manifest = JSON.parse(await readFile(report.manifests[0].path, 'utf8'));
    expect(manifest.path).toBe(paths.launcherPath);
    expect(manifest.allowed_origins).toEqual([
      `chrome-extension://${PINNED}/`,
      'chrome-extension://abcdefghijklmnopabcdefghijklmnop/',
    ]);
    expect(((await stat(paths.launcherPath)).mode & 0o777).toString(8)).toBe('755');
    expect((await readHostConfig(paths)).allowedOrigins).toEqual(manifest.allowed_origins);
    expect(await readFile(paths.launcherPath, 'utf8')).toContain(
      "exec '/usr/bin/node' '/opt/gf/dist/index.js' host serve"
    );
  });

  it('registers a named browser even without a profile, and fails when nothing matches', async () => {
    const { home, paths } = await prepare();
    const options = {
      browsers: null,
      extraExtensionIds: [],
      homeDirectory: home,
      paths,
      pathValue: '/bin',
      platform: 'linux' as const,
      target,
    };
    await expect(installHost(options)).rejects.toThrow(/No supported browser profile/);

    const report = await installHost({ ...options, browsers: ['chromium'] });
    expect(report.manifests.map((m) => m.browser)).toEqual(['chromium']);
    expect(report.manifests[0].path).toBe(manifestPath('chromium', 'linux', home));
  });

  it('rejects a malformed extra extension ID before writing anything', async () => {
    const { home, paths } = await prepare();
    await expect(
      installHost({
        browsers: ['chrome'],
        extraExtensionIds: ['not-an-id'],
        homeDirectory: home,
        paths,
        pathValue: '/bin',
        platform: 'darwin',
        target,
      })
    ).rejects.toThrow(/Not a Chrome extension ID/);
    await expect(stat(paths.launcherPath)).rejects.toThrow();
  });

  it('keeps saved API keys across a reinstall, and removes them only on purge', async () => {
    const { home, paths } = await prepare();
    await writeHostConfig(paths, {
      allowedOrigins: [],
      providers: { 'openai-api': { apiKey: 'sk-keep', model: 'gpt-x' } },
    });
    const options = {
      browsers: ['chrome'] as const,
      extraExtensionIds: [],
      homeDirectory: home,
      paths,
      pathValue: '/bin',
      platform: 'darwin' as const,
      target,
    };

    await installHost(options);
    expect((await readHostConfig(paths)).providers['openai-api']?.apiKey).toBe('sk-keep');
    expect(((await stat(paths.configPath)).mode & 0o777).toString(8)).toBe('600');

    const removed = await uninstallHost({
      homeDirectory: home,
      paths,
      platform: 'darwin',
      shouldPurge: false,
    });
    expect(removed.removed).toEqual([manifestPath('chrome', 'darwin', home), paths.launcherPath]);
    const afterUninstall = await readHostConfig(paths);
    expect(afterUninstall.allowedOrigins).toEqual([]);
    expect(afterUninstall.providers['openai-api']?.apiKey).toBe('sk-keep');

    await uninstallHost({ homeDirectory: home, paths, platform: 'darwin', shouldPurge: true });
    await expect(stat(paths.configPath)).rejects.toThrow();
  });

  it('reads back what is registered without running the launcher', async () => {
    const { home, paths } = await prepare();
    await installHost({
      browsers: ['brave', 'chrome'],
      extraExtensionIds: [],
      homeDirectory: home,
      paths,
      pathValue: '/bin',
      platform: 'darwin',
      target,
    });

    const manifests = await readInstalledManifests('darwin', home);

    expect(manifests.map((m) => [m.browser, m.isLauncherExecutable])).toEqual([
      ['chrome', true],
      ['brave', true],
    ]);
    expect(manifests[0].allowedOrigins).toEqual([`chrome-extension://${PINNED}/`]);
  });
});
