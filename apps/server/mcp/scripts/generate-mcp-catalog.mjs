#!/usr/bin/env node
/**
 * Regenerate `apps/server/mcp/mcp-catalog.json` — the committed snapshot of
 * every tool the MCP server surfaces. Derived from the canonical registry
 * source so a catalog change (add/remove/rename) always shows up as an explicit
 * diff. The `MCP catalog snapshot` spec fails until this is re-run.
 *
 * Usage: `bun run gen:mcp-catalog` (from apps/server/mcp).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(
  here,
  '../../../../packages/tools/src/registry/source',
);
const manifestPath = path.resolve(here, '../mcp-catalog.json');

const read = (file) => readFileSync(file, 'utf8');
const namesIn = (text) =>
  [...text.matchAll(/name:\s*'([a-z_]+)'/g)].map((match) => match[1]);

const names = [];
names.push(...namesIn(read(path.join(sourceDir, 'overlap.tools.ts'))));
names.push(...namesIn(read(path.join(sourceDir, 'workflow-control.tools.ts'))));
names.push(...namesIn(read(path.join(sourceDir, 'brand-interview.tools.ts'))));
const mcpOnlyDir = path.join(sourceDir, 'mcp-only');
for (const file of readdirSync(mcpOnlyDir)) {
  if (file.endsWith('.tools.ts')) {
    names.push(...namesIn(read(path.join(mcpOnlyDir, file))));
  }
}

const sorted = [...new Set(names)].sort();
writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${sorted.length} tool names to ${manifestPath}`);
