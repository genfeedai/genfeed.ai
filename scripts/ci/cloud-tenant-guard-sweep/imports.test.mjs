import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceImporter } from './imports.mjs';

test('CI retains native imports of the real API-workspace resolved file URL', async () => {
  const calls = [];
  const importer = createWorkspaceImporter({
    mode: 'ci',
    parentURL: import.meta.url,
    resolveSpecifier: (specifier) => {
      calls.push(specifier);
      return '/real workspace/prisma/src/client.ts';
    },
    nativeImport: async (url) => {
      calls.push(url);
      return { native: true };
    },
    loadScopedImporter: () => {
      throw new Error('CI must not load tsx');
    },
  });
  assert.deepEqual(await importer('@genfeedai/prisma/client'), {
    native: true,
  });
  assert.deepEqual(calls, [
    '@genfeedai/prisma/client',
    'file:///real%20workspace/prisma/src/client.ts',
  ]);
});

test('local mode lazily imports one scoped loader without tsconfig alias lookup', async () => {
  const calls = [];
  let loads = 0;
  const importer = createWorkspaceImporter({
    mode: 'local',
    parentURL: import.meta.url,
    resolveSpecifier: (specifier) =>
      `/real/${specifier.endsWith('client') ? 'client.ts' : 'actions.js'}`,
    nativeImport: () => {
      throw new Error('Local must use scoped TS import');
    },
    loadScopedImporter: async () => {
      loads++;
      return {
        tsImport: async (...args) => {
          calls.push(args);
          return { loaded: true };
        },
      };
    },
  });
  assert.equal(loads, 0);
  assert.deepEqual(await importer('@genfeedai/prisma/client'), {
    loaded: true,
  });
  await importer('@genfeedai/actions');
  assert.equal(loads, 1);
  assert.deepEqual(calls, [
    ['file:///real/client.ts', { parentURL: import.meta.url, tsconfig: false }],
    [
      'file:///real/actions.js',
      { parentURL: import.meta.url, tsconfig: false },
    ],
  ]);
});

test('invalid mode and real resolution/import errors fail without fallback', async () => {
  assert.throws(() => createWorkspaceImporter({ mode: 'other' }));
  const failure = new Error('Real module unavailable');
  const importer = createWorkspaceImporter({
    mode: 'local',
    resolveSpecifier: () => {
      throw failure;
    },
    loadScopedImporter: () => {
      throw new Error('Must not load before resolution');
    },
  });
  await assert.rejects(
    importer('@genfeedai/prisma/client'),
    (error) => error === failure,
  );
  const loadFailure = createWorkspaceImporter({
    mode: 'local',
    resolveSpecifier: () => '/real/client.ts',
    loadScopedImporter: async () => {
      throw failure;
    },
  });
  await assert.rejects(
    loadFailure('@genfeedai/prisma/client'),
    (error) => error === failure,
  );
});

test('real owned API workspace local importer encrypts/decrypts synthetic token and matches canonical workflow hash', async () => {
  const { createRequire } = await import('node:module');
  const { createHash } = await import('node:crypto');
  const { MACHINE_DEFINITION, MACHINE_CONTENT_HASH, MACHINE_TOKEN } =
    await import('./machine-fixture.mjs');
  const apiRequire = createRequire(
    new URL('../../../apps/server/api/package.json', import.meta.url),
  );
  const importer = createWorkspaceImporter({
    mode: 'local',
    resolveSpecifier: (specifier) => apiRequire.resolve(specifier),
    parentURL: import.meta.url,
  });
  const crypto = await importer('@genfeedai/libs/crypto/credential-cipher.ts');
  const key = crypto.deriveEncryptionKey('private-synthetic-key-canary');
  const cipher = crypto.encryptWithKey(key, MACHINE_TOKEN);
  assert.equal(crypto.isEncryptedValue(cipher), true);
  assert.equal(crypto.decryptWithKey(key, cipher), MACHINE_TOKEN);
  assert.throws(() =>
    crypto.decryptWithKey(
      crypto.deriveEncryptionKey('wrong-synthetic-key'),
      cipher,
    ),
  );
  const { stableStringify } = await importer(
    '@genfeedai/contracts/constants/canonical-json.constant',
  );
  assert.equal(
    `sha256:v1:${createHash('sha256').update(stableStringify(MACHINE_DEFINITION)).digest('hex')}`,
    MACHINE_CONTENT_HASH,
  );
});
