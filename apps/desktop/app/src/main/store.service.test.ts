import { afterEach, describe, expect, it } from 'bun:test';
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
