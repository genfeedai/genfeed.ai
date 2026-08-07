import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(testDir, '../..');
const COMMANDS_DIR = path.join(PACKAGE_ROOT, 'src/commands');
const INDEX_PATH = path.join(PACKAGE_ROOT, 'src/index.ts');
// Matches both `new Command(...)` and factory-built exports such as `createLoginCommand()`.
const EXPORTED_COMMAND = /^export const (\w+Command) =/m;

async function readTopLevelCommandExports(): Promise<{ file: string; exportName: string }[]> {
  const entries = await readdir(COMMANDS_DIR, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'));

  const exports: { file: string; exportName: string }[] = [];
  for (const file of files) {
    const source = await readFile(path.join(COMMANDS_DIR, file.name), 'utf8');
    const match = source.match(EXPORTED_COMMAND);
    if (match) {
      exports.push({ exportName: match[1], file: file.name });
    }
  }

  return exports;
}

describe('command registration', () => {
  it('registers every top-level command module on the program', async () => {
    const [commandExports, indexSource] = await Promise.all([
      readTopLevelCommandExports(),
      readFile(INDEX_PATH, 'utf8'),
    ]);

    expect(commandExports.length).toBeGreaterThan(0);

    const unregistered = commandExports
      .filter(({ exportName }) => !indexSource.includes(`.addCommand(${exportName})`))
      .map(({ file }) => file);

    expect(unregistered).toEqual([]);
  });

  it('keeps the reported CLI version in sync with package.json', async () => {
    const [indexSource, packageJson] = await Promise.all([
      readFile(INDEX_PATH, 'utf8'),
      readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ]);

    const { version } = JSON.parse(packageJson) as { version: string };
    expect(indexSource).toContain(`.version('${version}')`);
  });
});
