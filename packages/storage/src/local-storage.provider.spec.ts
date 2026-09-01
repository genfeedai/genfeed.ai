import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAccess = vi.fn();
const mockCopyFile = vi.fn();
const mockLstat = vi.fn();
const mockMkdir = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockUnlink = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  copyFile: (...args: unknown[]) => mockCopyFile(...args),
  lstat: (...args: unknown[]) => mockLstat(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

import { LocalStorageProvider } from './local-storage.provider';

const BASE_DIR = '/srv/genfeed/files';

/**
 * Electron's `userData` on macOS — spaces and all. On desktop the storage root
 * sits on the user's real disk, one level under the app's data directory, so
 * `..` walks straight into the PGlite database and then the home folder.
 */
const USER_DATA_DIR = '/Users/example/Library/Application Support/Genfeed';
const USER_DATA_BASE_DIR = `${USER_DATA_DIR}/files`;

const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

/** No entry exists, which is the normal state for an upload target. */
const mockMissingEntries = () => {
  mockLstat.mockRejectedValue(enoent);
};

/** Every walked segment is a symlink, standing in for a planted link. */
const mockSymlinkedEntries = () => {
  mockLstat.mockResolvedValue({ isSymbolicLink: () => true });
};

/**
 * Each of these escapes the storage root once `path.join` is done with it —
 * either by walking up with `../` or, for the absolute forms, by replacing the
 * root outright under `path.resolve`.
 */
const ESCAPING_PATHS = [
  '../escaped.txt',
  '../../etc/passwd',
  'nested/../../escaped.txt',
  '..',
  '/etc/passwd',
  '/srv/genfeed/files-sibling/escaped.txt',
];

describe('LocalStorageProvider path containment', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReaddir.mockResolvedValue([]);
    mockMissingEntries();
    provider = new LocalStorageProvider(BASE_DIR);
  });

  describe('upload', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(
        provider.upload(Buffer.from('payload'), filePath),
      ).rejects.toThrow(/must stay within/);

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockMkdir).not.toHaveBeenCalled();
    });

    it('writes inside the storage root for an ordinary path', async () => {
      await provider.upload(Buffer.from('payload'), 'nested/ok.txt');

      expect(mockWriteFile).toHaveBeenCalledWith(
        `${BASE_DIR}/nested/ok.txt`,
        expect.any(Buffer),
      );
    });
  });

  describe('uploadFromFile', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(
        provider.uploadFromFile(filePath, '/tmp/source.txt', '/tmp'),
      ).rejects.toThrow(/must stay within/);

      expect(mockCopyFile).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(
        provider.download(filePath, '/tmp/destination.txt'),
      ).rejects.toThrow(/must stay within/);

      expect(mockCopyFile).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(provider.delete(filePath)).rejects.toThrow(
        /must stay within/,
      );

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('unlinks inside the storage root for an ordinary path', async () => {
      await provider.delete('nested/ok.txt');

      expect(mockUnlink).toHaveBeenCalledWith(`${BASE_DIR}/nested/ok.txt`);
    });
  });

  describe('list', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (prefix) => {
      await expect(provider.list(prefix)).rejects.toThrow(/must stay within/);

      expect(mockReaddir).not.toHaveBeenCalled();
    });

    it('reads the resolved directory for an ordinary prefix', async () => {
      await provider.list('images');

      expect(mockReaddir).toHaveBeenCalledWith(`${BASE_DIR}/images`, {
        withFileTypes: true,
      });
    });
  });

  describe('listObjects', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (prefix) => {
      await expect(provider.listObjects(prefix)).rejects.toThrow(
        /must stay within/,
      );

      expect(mockReaddir).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it.each(ESCAPING_PATHS)(
      'rejects %s rather than probing it',
      async (filePath) => {
        await expect(provider.exists(filePath)).rejects.toThrow(
          /must stay within/,
        );

        expect(mockAccess).not.toHaveBeenCalled();
      },
    );
  });

  it('rejects a non-string path', async () => {
    await expect(
      provider.upload(Buffer.from('payload'), null as unknown as string),
    ).rejects.toThrow(/must be a string/);

    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

describe('LocalStorageProvider rooted at the desktop userData directory', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockReaddir.mockResolvedValue([]);
    mockMissingEntries();
    provider = new LocalStorageProvider(USER_DATA_BASE_DIR);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves the userData root from the desktop data directory', async () => {
    vi.stubEnv('GENFEED_DESKTOP_DATA_DIR', USER_DATA_DIR);
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('GENFEED_STORAGE_PATH', '');

    await new LocalStorageProvider().upload(
      Buffer.from('payload'),
      'ingredients/images/photo.png',
    );

    expect(mockWriteFile).toHaveBeenCalledWith(
      `${USER_DATA_BASE_DIR}/ingredients/images/photo.png`,
      expect.any(Buffer),
    );
  });

  it('writes inside the userData root for an ordinary path', async () => {
    await provider.upload(Buffer.from('payload'), 'ingredients/photo.png');

    expect(mockWriteFile).toHaveBeenCalledWith(
      `${USER_DATA_BASE_DIR}/ingredients/photo.png`,
      expect.any(Buffer),
    );
  });

  it.each([
    // The PGlite database lives beside the storage root.
    '../pglite-db/postgres',
    // Two levels up is the user's Application Support directory.
    '../../Preferences/com.apple.finder.plist',
    'ingredients/../../../.ssh/id_rsa',
    '/etc/passwd',
    `${USER_DATA_DIR}/files-sibling/escaped.png`,
  ])('rejects %s rather than touching the real disk', async (filePath) => {
    await expect(
      provider.upload(Buffer.from('payload'), filePath),
    ).rejects.toThrow(/must stay within/);
    await expect(provider.delete(filePath)).rejects.toThrow(/must stay within/);
    await expect(provider.exists(filePath)).rejects.toThrow(/must stay within/);

    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it.each(['linked.png', 'linked-dir/photo.png'])(
    'rejects %s once a symlink is planted under the root',
    async (filePath) => {
      mockSymlinkedEntries();

      await expect(
        provider.upload(Buffer.from('payload'), filePath),
      ).rejects.toThrow(/must not traverse a symbolic link/);
      await expect(provider.download(filePath, '/tmp/out.png')).rejects.toThrow(
        /must not traverse a symbolic link/,
      );

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockCopyFile).not.toHaveBeenCalled();
    },
  );
});
