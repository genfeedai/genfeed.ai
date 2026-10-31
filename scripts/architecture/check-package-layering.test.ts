import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PACKAGE_LAYERS,
  resolveImportTarget,
  runCheckPackageLayering,
} from './check-package-layering';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');

describe('check-package-layering', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'package-layering-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function write(file: string, content: string): void {
    const target = path.join(testDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  it('rejects a package importing a higher layer', () => {
    write(
      'packages/hooks/data/use-thing.ts',
      "import { Button } from '@ui/primitives/button';\n",
    );
    const { violations } = runCheckPackageLayering({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['upward-import']);
    expect(violations[0]?.imports[0]).toContain('hooks -> ui');
  });

  it('allows imports on the same or a lower layer', () => {
    write(
      'packages/ui/src/components/thing.tsx',
      [
        "import { useThing } from '@hooks/data/use-thing';",
        "import type { Thing } from '@genfeedai/contracts';",
        "import { ThingContext } from '@genfeedai/contexts';",
        "import { local } from './local';",
      ].join('\n'),
    );
    const { violations, totalUpwardImports } = runCheckPackageLayering({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
    expect(totalUpwardImports).toBe(0);
  });

  it('rejects any package importing an app, by alias or relative path', () => {
    write(
      'packages/agent/posts/list.tsx',
      "import { x } from '@app-components/x';\nimport { y } from '../../../apps/web/y';\n",
    );
    const { violations } = runCheckPackageLayering({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations[0]?.count).toBe(2);
    expect(violations[0]?.imports.join('\n')).toContain('agent -> apps');
  });

  it('allows baselined upward imports but rejects growth', () => {
    write(
      'packages/services/a.ts',
      "import type { A } from '@props/a';\nimport type { B } from '@genfeedai/props/b';\n",
    );
    const { violations } = runCheckPackageLayering({
      baseline: { 'packages/services/a.ts': 1 },
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['upward-import']);
  });

  it('fails a stale baseline so the count only goes down', () => {
    write('packages/services/a.ts', "import type { A } from '@props/a';\n");
    const { violations } = runCheckPackageLayering({
      baseline: {
        'packages/services/a.ts': 2,
        'packages/services/gone.ts': 1,
      },
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual([
      'stale-baseline',
      'stale-baseline',
    ]);
  });

  it('ignores specs and test folders', () => {
    write('packages/hooks/a.spec.ts', "import '@ui/primitives/button';\n");
    write('packages/hooks/tests/a.ts', "import '@ui/primitives/button';\n");
    const { violations } = runCheckPackageLayering({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
  });

  it('flags a package with no layer once', () => {
    write('packages/brand-new/a.ts', "import '@genfeedai/contracts';\n");
    write('packages/brand-new/b.ts', "import '@genfeedai/contracts';\n");
    const { violations } = runCheckPackageLayering({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['unknown-package']);
  });

  it('resolves scoped names, aliases and relative paths', () => {
    expect(
      resolveImportTarget('@genfeedai/ui/primitives', 'packages/hooks/a.ts'),
    ).toBe('ui');
    expect(
      resolveImportTarget(
        '@components/modals/modal/Modal',
        'packages/hooks/a.ts',
      ),
    ).toBe('ui');
    expect(
      resolveImportTarget('../../props/a', 'packages/hooks/data/a.ts'),
    ).toBe('props');
    expect(
      resolveImportTarget('@api/collections/x', 'packages/libs/a.ts'),
    ).toBe('apps');
    expect(resolveImportTarget('react', 'packages/hooks/a.ts')).toBeUndefined();
  });

  it('ranks every workspace package', () => {
    const packageDirs = readdirSync(path.join(REPOSITORY_ROOT, 'packages'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(
      packageDirs.filter((name) => PACKAGE_LAYERS[name] === undefined),
    ).toEqual([]);
  });
});
