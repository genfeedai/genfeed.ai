import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * The service used to boot a second MCP `Server` over stdio on every process
 * start that nothing ever drove, and reported its liveness as health. Streamable
 * HTTP is the only transport this service speaks; this ratchet stops a stdio
 * server from being reintroduced alongside it.
 */
describe('MCP transport surface', () => {
  // Tests are excluded: this file names the forbidden import to assert on it.
  const sourceFiles = collectSourceFiles(sourceRoot).filter(
    (file) => !file.endsWith('.spec.ts'),
  );

  it('has at least one source file to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('never imports the SDK stdio transport', () => {
    const offenders = sourceFiles
      .filter((file) => readFileSync(file, 'utf8').includes('server/stdio'))
      .map((file) => path.relative(sourceRoot, file));

    expect(offenders).toEqual([]);
  });

  it('mounts Streamable HTTP as the only transport in the bootstrap', () => {
    const bootstrap = readFileSync(path.join(sourceRoot, 'main.ts'), 'utf8');

    expect(bootstrap).toContain('markTransportMounted()');
    expect(bootstrap).not.toContain('StdioServerTransport');
  });
});
