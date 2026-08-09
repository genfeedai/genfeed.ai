import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  diffCatalogs,
  formatStepSummary,
  formatWarningAnnotation,
  parseCatalogSource,
} from './report-curated-action-catalog';

function catalog(entries: string): string {
  return `export const CURATED_ACTION_CATALOG = [\n${entries},\n] as const;`;
}

describe('curated action catalog change reporter', () => {
  it('reports action additions and removals deterministically', () => {
    const before = parseCatalogSource(
      catalog(
        `{ name: 'removed_action', surfaces: ['agent'] },
         { name: 'stable_action', surfaces: ['mcp'] }`,
      ),
    );
    const after = parseCatalogSource(
      catalog(
        `{ name: 'added_action', surfaces: ['agent', 'mcp'] },
         { name: 'stable_action', surfaces: ['mcp'] }`,
      ),
    );

    expect(diffCatalogs(before, after)).toEqual([
      expect.objectContaining({
        action: 'added_action',
        kind: 'action-added',
        surfaces: ['agent', 'mcp'],
      }),
      expect.objectContaining({
        action: 'removed_action',
        kind: 'action-removed',
        surfaces: ['agent'],
      }),
    ]);
  });

  it('reports both sides of a surface transition', () => {
    const before = parseCatalogSource(
      catalog(`{ name: 'move_action', surfaces: ['agent'] }`),
    );
    const after = parseCatalogSource(
      catalog(`{ name: 'move_action', surfaces: ['mcp'] }`),
    );

    expect(diffCatalogs(before, after)).toEqual([
      expect.objectContaining({
        action: 'move_action',
        kind: 'surface-removed',
        surfaces: ['agent'],
      }),
      expect.objectContaining({
        action: 'move_action',
        kind: 'surface-added',
        surfaces: ['mcp'],
      }),
    ]);
  });

  it('accepts canonical publishing approval metadata', () => {
    expect(
      parseCatalogSource(
        catalog(
          `{
            isPublishingApprovalRequired: true,
            name: 'publish_action',
            surfaces: ['mcp'],
          }`,
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        name: 'publish_action',
        surfaces: ['mcp'],
      }),
    ]);
  });

  it('formats warning annotations and a complete step summary', () => {
    const [change] = diffCatalogs(
      [],
      parseCatalogSource(catalog(`{ name: 'new_action', surfaces: ['mcp'] }`)),
    );
    if (!change) {
      throw new Error('Expected a catalog change fixture');
    }

    expect(formatWarningAnnotation(change)).toContain(
      '::warning file=packages/tools/src/registry/curated-action-catalog.ts',
    );
    expect(formatStepSummary([change])).toContain(
      '| action-added | `new_action` | mcp |',
    );
  });

  it('rejects duplicate action names', () => {
    expect(() =>
      parseCatalogSource(
        catalog(
          `{ name: 'duplicate', surfaces: ['agent'] },
           { name: 'duplicate', surfaces: ['mcp'] }`,
        ),
      ),
    ).toThrow(/duplicates action duplicate/);
  });

  it('returns no actions for an empty source', () => {
    expect(parseCatalogSource('')).toEqual([]);
    expect(parseCatalogSource('   \n\t\n')).toEqual([]);
  });

  it('rejects sources without a canonical catalog declaration', () => {
    expect(() =>
      parseCatalogSource('const catalog = [];', 'custom.ts'),
    ).toThrow(/custom\.ts does not declare CURATED_ACTION_CATALOG/);
  });

  it('rejects entries outside the canonical single-line form', () => {
    expect(() =>
      parseCatalogSource(catalog(`{ name: 'Bad-Name', surfaces: ['agent'] }`)),
    ).toThrow(/is not a canonical catalog entry/);
  });

  it('rejects duplicate surfaces on one entry', () => {
    expect(() =>
      parseCatalogSource(
        catalog(`{ name: 'twice', surfaces: ['agent', 'agent'] }`),
      ),
    ).toThrow(/must have unique, non-empty surfaces/);
  });

  it('rejects entries with an empty surface list', () => {
    expect(() =>
      parseCatalogSource(catalog(`{ name: 'nowhere', surfaces: [] }`)),
    ).toThrow(/must have unique, non-empty surfaces/);
  });

  it('skips blank lines and comments between entries', () => {
    const source = catalog(
      `// reviewed boundary note

         { name: 'kept_action', surfaces: ['agent'] }`,
    );
    expect(parseCatalogSource(source)).toEqual([
      expect.objectContaining({ name: 'kept_action', surfaces: ['agent'] }),
    ]);
  });

  it('reports no changes for identical catalogs', () => {
    const parsed = parseCatalogSource(
      catalog(`{ name: 'same_action', surfaces: ['agent', 'mcp'] }`),
    );
    expect(diffCatalogs(parsed, parsed)).toEqual([]);
  });

  it('describes every change kind in warning annotations', () => {
    const before = parseCatalogSource(
      catalog(
        `{ name: 'gone_action', surfaces: ['agent'] },
         { name: 'moved_action', surfaces: ['agent'] }`,
      ),
    );
    const after = parseCatalogSource(
      catalog(
        `{ name: 'moved_action', surfaces: ['mcp'] },
         { name: 'new_action', surfaces: ['mcp'] }`,
      ),
    );

    const annotations = diffCatalogs(before, after).map(
      formatWarningAnnotation,
    );
    expect(annotations.join('\n')).toContain(
      'Curated action removed: gone_action (agent)',
    );
    expect(annotations.join('\n')).toContain(
      'Curated action surface removed: moved_action (agent)',
    );
    expect(annotations.join('\n')).toContain(
      'Curated action surface added: moved_action (mcp)',
    );
    expect(annotations.join('\n')).toContain(
      'Curated action added: new_action (mcp)',
    );
  });

  it('summarizes a change-free run', () => {
    expect(formatStepSummary([])).toBe(
      '## Curated action catalog changes\n\nNo action additions, removals, or surface transitions detected.\n',
    );
  });
});

describe('curated action catalog change reporter CLI', () => {
  const scriptPath = fileURLToPath(
    new URL('./report-curated-action-catalog.ts', import.meta.url),
  );
  const originalArgv = process.argv;
  let workDir: string | undefined;

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    vi.resetModules();
    if (workDir) {
      rmSync(workDir, { force: true, recursive: true });
      workDir = undefined;
    }
  });

  it('diffs two catalog files and appends the step summary', async () => {
    workDir = mkdtempSync(join(tmpdir(), 'catalog-report-'));
    const beforePath = join(workDir, 'before.ts');
    const afterPath = join(workDir, 'after.ts');
    const summaryPath = join(workDir, 'summary.md');
    writeFileSync(
      beforePath,
      catalog(`{ name: 'stable_action', surfaces: ['agent'] }`),
    );
    writeFileSync(
      afterPath,
      catalog(
        `{ name: 'added_action', surfaces: ['mcp'] },
         { name: 'stable_action', surfaces: ['agent'] }`,
      ),
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.argv = [
      originalArgv[0] ?? 'node',
      scriptPath,
      `--before=${beforePath}`,
      `--after=${afterPath}`,
      `--summary=${summaryPath}`,
    ];
    vi.resetModules();
    await import('./report-curated-action-catalog');

    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain(
      '::warning file=packages/tools/src/registry/curated-action-catalog.ts',
    );
    expect(logged).toContain('Curated action added: added_action (mcp)');
    expect(readFileSync(summaryPath, 'utf8')).toContain(
      '| action-added | `added_action` | mcp |',
    );
  });

  it('rejects an invocation without both catalog paths', async () => {
    process.argv = [originalArgv[0] ?? 'node', scriptPath];
    vi.resetModules();

    await expect(import('./report-curated-action-catalog')).rejects.toThrow(
      /Usage: catalog:changes --before=/,
    );
  });
});
