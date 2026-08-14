import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface DesktopPackageJson {
  build?: {
    afterSign?: string;
    appId?: string;
    artifactName?: string;
    asar?: boolean;
    asarUnpack?: string[];
    extraMetadata?: {
      main?: string;
    };
    files?: string[];
    mac?: {
      entitlements?: string;
      entitlementsInherit?: string;
      hardenedRuntime?: boolean;
      icon?: string;
      target?: string[];
    };
    protocols?: Array<{
      schemes?: string[];
    }>;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
  productName?: string;
  scripts?: Record<string, string>;
}

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const readPackageJson = (): DesktopPackageJson =>
  JSON.parse(
    fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'),
  ) as DesktopPackageJson;
const readReleaseScript = (name: string): string =>
  fs.readFileSync(path.join(desktopRoot, 'scripts', name), 'utf8');
const electronBuilderArtifactName =
  'GenFeed-$' + '{version}-$' + '{arch}.$' + '{ext}';

describe('desktop release config', () => {
  it('keeps macOS release artifacts signed, notarized, and self-contained', () => {
    const packageJson = readPackageJson();
    const build = packageJson.build;
    const mac = build?.mac;

    expect(packageJson.productName).toBe('GenFeed');
    expect(packageJson.main).toBe('dist/main.js');
    expect(build?.appId).toBe('ai.genfeed.desktop');
    expect(build?.afterSign).toBe('scripts/notarize.cjs');
    expect(build?.artifactName).toBe(electronBuilderArtifactName);
    expect(build?.asar).toBe(true);
    expect(build?.extraMetadata?.main).toBe('dist/main.js');
    expect(build?.files).toContain('dist/**/*');
    expect(build?.files).toContain('package.json');
    expect(build?.asarUnpack).toContain('dist/app-shell/**/*');
    expect(build?.protocols?.[0]?.schemes).toContain('genfeedai-desktop');
    expect(packageJson.scripts?.['release:manifest']).toBe(
      'node ./scripts/write-release-manifest.cjs',
    );
    expect(packageJson.scripts?.['release:metadata']).toBe(
      'node ./scripts/finalize-macos-release.cjs',
    );
    expect(packageJson.scripts?.['release:mac']).not.toContain(
      'release:manifest',
    );
    expect(
      fs.existsSync(
        path.join(desktopRoot, 'scripts/write-release-manifest.cjs'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(desktopRoot, 'scripts/finalize-macos-release.cjs'),
      ),
    ).toBe(true);
    const notarizeScript = readReleaseScript('notarize.cjs');
    const releaseManifestScript = readReleaseScript(
      'write-release-manifest.cjs',
    );
    expect(notarizeScript).toContain('APPLE_API_KEY');
    expect(notarizeScript).toContain('APPLE_API_KEY_ID');
    expect(notarizeScript).toContain('APPLE_API_ISSUER');
    expect(notarizeScript).not.toContain('APPLE_APP_SPECIFIC_PASSWORD');
    expect(releaseManifestScript).toContain('DEVELOPER_ID_P12_BASE64');
    expect(releaseManifestScript).toContain('DEVELOPER_ID_P12_PASSWORD');

    expect(mac?.hardenedRuntime).toBe(true);
    expect(mac?.target).toContain('dmg');
    expect(mac?.target).toContain('zip');
    expect(mac?.icon).toBe('build/icon.icns');
    const iconScript = readReleaseScript('generate-macos-icon.sh');
    expect(iconScript).toContain('assets/app-icon.jpg');
    expect(iconScript).toContain('../../app/public/logo.svg');
    expect(iconScript).toContain('assets/tray-icon.png');
    expect(iconScript).toContain('assets/tray-icon@2x.png');
    expect(mac?.entitlements).toBe('assets/entitlements.mac.plist');
    expect(mac?.entitlementsInherit).toBe('assets/entitlements.mac.plist');
    expect(fs.existsSync(path.join(desktopRoot, mac?.entitlements ?? ''))).toBe(
      true,
    );
  });

  it('packages only native runtime dependencies and compacts the app shell', () => {
    const packageJson = readPackageJson();
    const buildMain = packageJson.scripts?.['build:main'] ?? '';
    const copyShell = readReleaseScript('copy-app-shell.cjs');

    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual([
      '@electric-sql/pglite',
      'node-pty',
    ]);
    expect(packageJson.devDependencies).toHaveProperty('electron-updater');
    expect(packageJson.devDependencies).toHaveProperty(
      '@genfeedai/desktop-prisma',
    );
    expect(buildMain).not.toContain('--external:@prisma/client');
    expect(buildMain).not.toContain('--external:electron-updater');
    expect(buildMain).toContain('__genfeedCreateRequire(import.meta.url)');
    expect(copyShell).toContain('compactStandaloneDependencies');
    expect(copyShell).toContain(
      "path.join(nodeModulesRoot, '.bun', 'node_modules')",
    );
    expect(copyShell).toContain(
      "path.join(root, 'apps', 'app', 'node_modules')",
    );
    expect(copyShell).toContain('copyNextRuntimeDependency');
    expect(copyShell).toContain("'@swc/helpers'");
    expect(copyShell).toContain('pruneDisabledImageOptimizer');
    expect(copyShell).toContain("path.join(nodeModulesRoot, 'sharp')");
    expect(copyShell).toContain("path.join(nodeModulesRoot, '@img')");
  });

  it('pins PGlite to the database format used by existing desktop installs', () => {
    const packageJson = readPackageJson();
    const desktopPrismaPackage = JSON.parse(
      fs.readFileSync(
        path.resolve(
          desktopRoot,
          '../../../packages/desktop-prisma/package.json',
        ),
        'utf8',
      ),
    ) as DesktopPackageJson;

    expect(packageJson.dependencies?.['@electric-sql/pglite']).toBe('0.5.4');
    expect(desktopPrismaPackage.dependencies?.['@electric-sql/pglite']).toBe(
      '0.5.4',
    );
  });
});
