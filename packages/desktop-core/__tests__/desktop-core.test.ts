import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mkdirSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: { mkdirSync: mkdirSyncMock },
  mkdirSync: mkdirSyncMock,
}));

import {
  buildDesktopDataDir,
  buildWorkspaceAssetsDir,
  buildWorkspaceDraftsPath,
  buildWorkspaceMetadataDir,
  buildWorkspaceThreadsPath,
  DEFAULT_MAX_INDEXED_FILES,
  resolvePathInsideRoot,
} from '../src/index';

describe('buildDesktopDataDir', () => {
  beforeEach(() => {
    mkdirSyncMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves under GENFEED_DESKTOP_DATA_DIR when set', () => {
    vi.stubEnv('GENFEED_DESKTOP_DATA_DIR', '/custom/base');

    const dir = buildDesktopDataDir('studio');

    expect(dir).toBe(path.join(path.resolve('/custom/base'), 'studio'));
    expect(mkdirSyncMock).toHaveBeenCalledWith(dir, { recursive: true });
  });

  it('falls back to <cwd>/.data when the env var is unset', () => {
    vi.stubEnv('GENFEED_DESKTOP_DATA_DIR', '');

    const dir = buildDesktopDataDir('studio');

    expect(dir).toBe(path.join(process.cwd(), '.data', 'studio'));
    expect(mkdirSyncMock).toHaveBeenCalledWith(dir, { recursive: true });
  });
});

describe('workspace path builders', () => {
  const root = path.join(path.sep, 'workspaces', 'acme');

  it('builds the metadata dir under .genfeed', () => {
    expect(buildWorkspaceMetadataDir(root)).toBe(path.join(root, '.genfeed'));
  });

  it('builds the assets dir under .genfeed/assets', () => {
    expect(buildWorkspaceAssetsDir(root)).toBe(
      path.join(root, '.genfeed', 'assets'),
    );
  });

  it('builds the drafts path under .genfeed/content-runs.json', () => {
    expect(buildWorkspaceDraftsPath(root)).toBe(
      path.join(root, '.genfeed', 'content-runs.json'),
    );
  });

  it('builds the threads path under .genfeed/threads.json', () => {
    expect(buildWorkspaceThreadsPath(root)).toBe(
      path.join(root, '.genfeed', 'threads.json'),
    );
  });

  it('exposes the default indexed-file cap', () => {
    expect(DEFAULT_MAX_INDEXED_FILES).toBe(5000);
  });
});

describe('resolvePathInsideRoot', () => {
  const root = path.join(path.sep, 'workspaces', 'acme');

  it('resolves a relative path inside the root', () => {
    expect(resolvePathInsideRoot(root, 'notes/todo.md')).toBe(
      path.join(root, 'notes', 'todo.md'),
    );
  });

  it('returns the root itself for "."', () => {
    expect(resolvePathInsideRoot(root, '.')).toBe(root);
  });

  it('throws when the path escapes the root via ..', () => {
    expect(() => resolvePathInsideRoot(root, '../outside.txt')).toThrow(
      'Path escapes workspace root',
    );
  });

  it('throws for sibling directories sharing the root prefix', () => {
    expect(() => resolvePathInsideRoot(root, '../acme-evil/file.txt')).toThrow(
      'Path escapes workspace root',
    );
  });
});
