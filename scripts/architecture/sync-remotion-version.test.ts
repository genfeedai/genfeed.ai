import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncRemotionVersion } from './sync-remotion-version';

const directories: string[] = [];
const contractPath =
  'packages/contracts/src/interfaces/editor/editor-export-contract.interface.ts';
const originalContract =
  "export const EDITOR_RENDERER_VERSION = 'remotion@4.0.528' as const;\n";

function createFixture(
  filesVersion = '4.0.530',
  playerVersion = filesVersion,
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'remotion-version-'));
  directories.push(root);
  const files: Record<string, string> = {
    'apps/server/files/package.json': JSON.stringify({
      dependencies: {
        '@remotion/bundler': filesVersion,
        '@remotion/renderer': filesVersion,
        remotion: filesVersion,
      },
    }),
    'apps/app/package.json': JSON.stringify({
      dependencies: {
        '@remotion/player': filesVersion,
        remotion: filesVersion,
      },
    }),
    'packages/props/package.json': JSON.stringify({
      dependencies: { '@remotion/player': playerVersion },
    }),
    [contractPath]: originalContract,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = path.join(root, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  return root;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Remotion dependency updater contract', () => {
  it('updates the literal renderer contract after a coherent package bump', () => {
    const root = createFixture();
    expect(syncRemotionVersion(root)).toBe('4.0.530');
    expect(readFileSync(path.join(root, contractPath), 'utf8')).toBe(
      "export const EDITOR_RENDERER_VERSION = 'remotion@4.0.530' as const;\n",
    );
  });

  it('rejects a mismatched props player before modifying the renderer contract', () => {
    const root = createFixture('4.0.530', '4.0.529');
    expect(() => syncRemotionVersion(root)).toThrow(
      'packages/props/package.json',
    );
    expect(readFileSync(path.join(root, contractPath), 'utf8')).toBe(
      originalContract,
    );
  });

  it('rejects ranges that cannot guarantee a matching installed renderer', () => {
    const root = createFixture('^4.0.530');
    expect(() => syncRemotionVersion(root)).toThrow('exact Remotion version');
    expect(readFileSync(path.join(root, contractPath), 'utf8')).toBe(
      originalContract,
    );
  });
});
