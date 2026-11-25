import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

interface ExcludeDesktopRoutes {
  DESKTOP_EXCLUDED_ROUTE_DIRECTORIES: string[];
  excludeRoutesFromBuild(appRoot: string, directories?: string[]): () => void;
  restoreExcludedRoutes(appRoot: string, directories?: string[]): string[];
}

const require = createRequire(import.meta.url);
const exclude =
  require('../../scripts/exclude-desktop-routes.cjs') as ExcludeDesktopRoutes;

const ADMIN = path.join('app', '(protected)', 'admin');

describe('desktop route exclusion', () => {
  let appRoot = '';

  const adminFile = path.join(ADMIN, 'overview', 'page.tsx');
  const exists = (relativePath: string): boolean =>
    fs.existsSync(path.join(appRoot, relativePath));

  beforeEach(() => {
    appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-exclude-'));
    fs.mkdirSync(path.join(appRoot, path.dirname(adminFile)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(appRoot, adminFile), 'export {};');
    fs.mkdirSync(path.join(appRoot, 'app', '(protected)', 'home'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(appRoot, 'app', '(protected)', 'home', 'page.tsx'),
      'export {};',
    );
  });

  afterEach(() => {
    fs.rmSync(appRoot, { force: true, recursive: true });
  });

  it('leaves the platform admin routes out of the Desktop build', () => {
    expect(exclude.DESKTOP_EXCLUDED_ROUTE_DIRECTORIES).toContain(ADMIN);
  });

  it('moves the folder away for the build and puts it back afterwards', () => {
    const restore = exclude.excludeRoutesFromBuild(appRoot, [ADMIN]);

    expect(exists(ADMIN)).toBe(false);
    expect(exists(path.join('app', '(protected)', 'home', 'page.tsx'))).toBe(
      true,
    );

    restore();
    restore();

    expect(fs.readFileSync(path.join(appRoot, adminFile), 'utf8')).toBe(
      'export {};',
    );
  });

  it('restores folders a killed build left behind before the next one', () => {
    exclude.excludeRoutesFromBuild(appRoot, [ADMIN]);

    const restore = exclude.excludeRoutesFromBuild(appRoot, [ADMIN]);

    expect(exists(ADMIN)).toBe(false);

    restore();

    expect(exists(adminFile)).toBe(true);
  });

  it('fails when an excluded folder no longer exists', () => {
    expect(() =>
      exclude.excludeRoutesFromBuild(appRoot, [
        ADMIN,
        path.join('app', 'gone'),
      ]),
    ).toThrow('missing');

    expect(exists(adminFile)).toBe(true);
  });
});
