import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the app↔package boundary established by the workflow-ui host-config
 * refactor (audit §2.I / §6.10). The app must consume the package store +
 * injection seam, not re-shadow package modules. If a shadow reappears, these
 * assertions fail loudly instead of silently drifting.
 */

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// Import specifiers that resolved to the deleted app shadows.
const FORBIDDEN_SPECIFIERS = [
  '@/store/settingsStore',
  '@/store/promptLibraryStore',
  '@/hooks/usePaneActions',
  '@/types/groups',
];

// The shadow files themselves must no longer exist.
const REMOVED_FILES = [
  'store/settingsStore.ts',
  'store/promptLibraryStore.ts',
  'hooks/usePaneActions.ts',
  'types/groups.ts',
];

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('workflow-ui app↔package boundary', () => {
  it('has removed every app shadow module', () => {
    for (const rel of REMOVED_FILES) {
      expect(existsSync(path.join(SRC_ROOT, rel)), `${rel} still exists`).toBe(
        false,
      );
    }
  });

  it('has no imports of the deleted shadow specifiers', () => {
    const files = collectSourceFiles(SRC_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith('workflow-ui-boundary.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      for (const specifier of FORBIDDEN_SPECIFIERS) {
        const pattern = new RegExp(
          `from ['"]${specifier.replace(/[/\\]/g, '\\$&')}['"]`,
        );
        if (pattern.test(content)) {
          offenders.push(`${path.relative(SRC_ROOT, file)} → ${specifier}`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
