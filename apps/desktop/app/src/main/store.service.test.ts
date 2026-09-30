import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopStoreService } from './store.service';

const temporaryDirectories: string[] = [];

function createStore(): DesktopStoreService {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'genfeed-desktop-store-'),
  );
  temporaryDirectories.push(directory);
  return new DesktopStoreService(path.join(directory, 'desktop-state.json'));
}

afterEach(() => {
  mock.restore();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('DesktopStoreService', () => {
  it('persists values without a database runtime', async () => {
    const store = createStore();
    store.setValueSync('desktop.runtime.mode', 'local');
    await store.setValue('desktop.session', 'encrypted');

    const restarted = new DesktopStoreService(store.getPath());
    expect(restarted.getValueSync('desktop.runtime.mode')).toBe('local');
    await expect(restarted.getValue('desktop.session')).resolves.toBe(
      'encrypted',
    );
  });

  it.each(['mkdirSync', 'writeFileSync', 'chmodSync', 'renameSync'] as const)(
    'keeps disk and cache unchanged after %s rejects',
    (operation) => {
      const store = createStore();
      store.setValueSync('desktop.runtime.mode', 'local');
      store.setValueSync('desktop.session', 'encrypted-fixture');
      const before = fs.readFileSync(store.getPath(), 'utf8');
      const failure = new Error(`fixture ${operation} failed`);
      const fault = spyOn(fs, operation).mockImplementation(() => {
        throw failure;
      });
      expect(() => store.setValueSync('desktop.runtime.mode', 'cloud')).toThrow(
        failure,
      );
      fault.mockRestore();
      expect(fs.readFileSync(store.getPath(), 'utf8')).toBe(before);
      expect(store.getValueSync('desktop.runtime.mode')).toBe('local');
      const restarted = new DesktopStoreService(store.getPath());
      expect(restarted.getValueSync('desktop.runtime.mode')).toBe('local');
      expect(restarted.getValueSync('desktop.session')).toBe(
        'encrypted-fixture',
      );
    },
  );
  it('publishes the candidate only after a final rename with private permissions', () => {
    const store = createStore();
    store.setValueSync('keep', 'fixture');
    store.setValueSync('desktop.runtime.mode', 'local');
    const originalRename = fs.renameSync.bind(fs);
    const originalChmod = fs.chmodSync.bind(fs);
    const stages: string[] = [];
    spyOn(fs, 'chmodSync').mockImplementation((file, mode) => {
      stages.push('chmod');
      expect(String(file)).toMatch(/\.tmp$/);
      originalChmod(file, mode);
    });
    spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      stages.push('rename');
      expect(store.getValueSync('desktop.runtime.mode')).toBe('local');
      expect(fs.statSync(from).mode & 0o777).toBe(0o600);
      originalRename(from, to);
    });
    store.setValueSync('desktop.runtime.mode', 'cloud');
    expect(stages).toEqual(['chmod', 'rename']);
    expect(store.getValueSync('desktop.runtime.mode')).toBe('cloud');
    expect(new DesktopStoreService(store.getPath()).getValueSync('keep')).toBe(
      'fixture',
    );
    expect(JSON.parse(fs.readFileSync(store.getPath(), 'utf8'))).toEqual({
      keep: 'fixture',
      'desktop.runtime.mode': 'cloud',
    });
    expect(fs.statSync(store.getPath()).mode & 0o777).toBe(0o600);
  });

  it('recovers from malformed state without deleting the file eagerly', () => {
    const store = createStore();
    fs.mkdirSync(path.dirname(store.getPath()), { recursive: true });
    fs.writeFileSync(store.getPath(), '{broken', 'utf8');

    expect(store.getValueSync('missing')).toBeNull();
    expect(fs.readFileSync(store.getPath(), 'utf8')).toBe('{broken');
  });

  it('deletes only the requested value', async () => {
    const store = createStore();
    store.setValueSync('keep', 'yes');
    store.setValueSync('remove', 'yes');

    await store.deleteValue('remove');

    expect(store.getValueSync('keep')).toBe('yes');
    expect(store.getValueSync('remove')).toBeNull();
  });
});
