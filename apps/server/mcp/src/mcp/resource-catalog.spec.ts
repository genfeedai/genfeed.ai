import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_RESOURCES, McpResourceUri } from '@mcp/mcp/resource-catalog';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);

    if (statSync(fullPath).isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return fullPath.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('MCP resource catalog', () => {
  it('exposes every declared URI exactly once', () => {
    const uris = MCP_RESOURCES.map((resource) => resource.uri);

    expect(new Set(uris).size).toBe(uris.length);
    expect(uris).toEqual(expect.arrayContaining(Object.values(McpResourceUri)));
    expect(uris).toHaveLength(Object.values(McpResourceUri).length);
  });

  it('describes every resource well enough for a client to pick one', () => {
    for (const resource of MCP_RESOURCES) {
      expect(resource.name).toBeTruthy();
      expect(resource.description).toBeTruthy();
      expect(resource.mimeType).toBe('application/json');
      expect(resource.uri.startsWith('genfeed://')).toBe(true);
    }
  });

  /**
   * The catalog exists because three surfaces used to carry verbatim copies of
   * these URIs. This ratchet keeps the literals from creeping back: outside
   * tests, only the catalog itself may spell a `genfeed://` URI.
   */
  it('is the only source file that spells a resource URI literal', () => {
    const offenders = collectSourceFiles(sourceRoot)
      .filter(
        (file) =>
          !file.endsWith('resource-catalog.ts') && !file.endsWith('.spec.ts'),
      )
      .filter((file) => readFileSync(file, 'utf8').includes("'genfeed://"))
      .map((file) => path.relative(sourceRoot, file));

    expect(offenders).toEqual([]);
  });
});
