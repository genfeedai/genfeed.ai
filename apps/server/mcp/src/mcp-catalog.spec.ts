import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Committed snapshot of the MCP tool catalog. `mcp-catalog.json` is the list of
 * every tool the server surfaces on MCP, derived from the canonical registry
 * source. Any add / remove / rename must update the snapshot in the same PR, so
 * catalog changes are always explicit in review (they otherwise hide inside
 * `packages/tools` and are easy to miss).
 *
 * Regenerate: `bun run gen:mcp-catalog` (see package.json).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(
  here,
  '../../../../packages/tools/src/registry/source',
);
const manifestPath = path.resolve(here, '../mcp-catalog.json');

const read = (file: string): string => readFileSync(file, 'utf8');
const namesIn = (text: string): string[] =>
  [...text.matchAll(/name:\s*'([a-z_]+)'/g)].map((match) => match[1]);

function surfacedToolNames(): string[] {
  const names: string[] = [];
  names.push(...namesIn(read(path.join(sourceDir, 'overlap.tools.ts'))));
  names.push(
    ...namesIn(read(path.join(sourceDir, 'workflow-control.tools.ts'))),
  );
  names.push(
    ...namesIn(read(path.join(sourceDir, 'brand-interview.tools.ts'))),
  );
  const mcpOnlyDir = path.join(sourceDir, 'mcp-only');
  for (const file of readdirSync(mcpOnlyDir)) {
    if (file.endsWith('.tools.ts')) {
      names.push(...namesIn(read(path.join(mcpOnlyDir, file))));
    }
  }
  return [...new Set(names)].sort();
}

describe('MCP catalog snapshot', () => {
  it('matches the committed mcp-catalog.json', () => {
    const committed = JSON.parse(read(manifestPath)) as string[];
    expect(surfacedToolNames()).toEqual(committed);
  });
});
