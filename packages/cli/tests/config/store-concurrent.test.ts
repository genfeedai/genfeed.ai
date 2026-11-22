import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tempHome = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const patched = { ...actual, homedir: () => tempHome.dir };
  return { ...patched, default: patched };
});

type StoreModule = typeof import('../../src/config/store');

/** A fresh module instance stands in for a separate CLI process with its own cache. */
async function loadStoreInstance(): Promise<StoreModule> {
  vi.resetModules();
  return import('../../src/config/store');
}

describe('config/store concurrent writers', () => {
  beforeEach(async () => {
    tempHome.dir = await mkdtemp(path.join(os.tmpdir(), 'gf-store-'));
  });

  afterEach(async () => {
    await rm(tempHome.dir, { force: true, recursive: true });
  });

  it('keeps a field another process saved after this one loaded its copy', async () => {
    const storeA = await loadStoreInstance();
    const storeB = await loadStoreInstance();
    await storeA.loadConfig();
    await storeB.loadConfig();

    await storeA.setApiKey('gf_live_from_a');
    await storeB.setActiveBrand('brand-from-b');

    const onDisk = JSON.parse(await readFile(storeA.getConfigPath(), 'utf8'));
    expect(onDisk.profiles.default.apiKey).toBe('gf_live_from_a');
    expect(onDisk.profiles.default.activeBrand).toBe('brand-from-b');
  });

  it('keeps a profile created elsewhere when another process sets a field', async () => {
    const storeA = await loadStoreInstance();
    const storeB = await loadStoreInstance();
    await storeA.loadConfig();
    await storeB.loadConfig();

    await storeA.createProfile('work');
    await storeB.setOrganizationId('org-1');

    const onDisk = JSON.parse(await readFile(storeA.getConfigPath(), 'utf8'));
    expect(Object.keys(onDisk.profiles).sort()).toEqual(['default', 'work']);
    expect(onDisk.profiles.default.organizationId).toBe('org-1');
  });

  it('writes the file with owner-only permissions', async () => {
    const store = await loadStoreInstance();
    await store.setApiKey('gf_live_key');
    expect((await stat(store.getConfigPath())).mode & 0o777).toBe(0o600);
  });
});
