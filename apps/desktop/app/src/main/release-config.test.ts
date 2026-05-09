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
  main?: string;
  productName?: string;
}

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const readPackageJson = (): DesktopPackageJson =>
  JSON.parse(
    fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'),
  ) as DesktopPackageJson;
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

    expect(mac?.hardenedRuntime).toBe(true);
    expect(mac?.target).toContain('dmg');
    expect(mac?.target).toContain('zip');
    expect(mac?.icon).toBe('build/icon.icns');
    expect(mac?.entitlements).toBe('assets/entitlements.mac.plist');
    expect(mac?.entitlementsInherit).toBe('assets/entitlements.mac.plist');
    expect(fs.existsSync(path.join(desktopRoot, mac?.entitlements ?? ''))).toBe(
      true,
    );
  });
});
