import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * OperationIds are `<ControllerClass>.<method>` (#1247), so controller class
 * names must be unique across the api or two routes collide onto one id —
 * which would silently break MCP tool identity (#1246). This guard walks the
 * source tree instead of the DI container so it also catches controllers that
 * are added but not yet wired.
 */

const specDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(specDir, '..', '..', '..');

const CONTROLLER_CLASS_PATTERN = /^export class (\w+Controller)\b/;

function walkControllerFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      files.push(...walkControllerFiles(fullPath));
      continue;
    }

    if (fullPath.endsWith('.controller.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('controller class-name uniqueness', () => {
  it('finds controller files (sanity check that the walk is anchored)', () => {
    expect(walkControllerFiles(srcRoot).length).toBeGreaterThan(100);
  });

  it('has no duplicate exported controller class names', () => {
    const classToFiles = new Map<string, string[]>();

    for (const file of walkControllerFiles(srcRoot)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (const line of lines) {
        const match = CONTROLLER_CLASS_PATTERN.exec(line);
        if (!match?.[1]) {
          continue;
        }
        const className = match[1];
        const existing = classToFiles.get(className) ?? [];
        existing.push(relative(srcRoot, file));
        classToFiles.set(className, existing);
      }
    }

    const duplicates = [...classToFiles.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([className, files]) => `${className}: ${files.join(', ')}`);

    expect(duplicates).toEqual([]);
  });
});
