import { describe, expect, it } from 'vitest';
import {
  diffCatalogs,
  formatStepSummary,
  formatWarningAnnotation,
  parseCatalogSource,
} from './report-curated-action-catalog';

function catalog(entries: string): string {
  return `export const CURATED_ACTION_CATALOG = [${entries}] as const;`;
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
});
