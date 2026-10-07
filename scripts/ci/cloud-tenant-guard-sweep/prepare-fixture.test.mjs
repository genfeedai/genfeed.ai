import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareFixture } from './prepare-fixture.mjs';

for (const mode of [
  'empty',
  'users',
  'existing',
  'createFailure',
  'readbackFalse',
  'readbackFailure',
]) {
  test(`fixture preparation ${mode} disconnects and never replays writes`, async () => {
    let reads = 0,
      writes = 0,
      disconnected = 0;
    const prisma = {
      user: { count: async () => (mode === 'users' ? 1 : 0) },
      platformSetting: {
        findUnique: async ({ where }) => {
          assert.deepEqual(where, { key: 'platform' });
          reads++;
          if (mode === 'existing')
            return { isEmailVerificationRequired: false };
          if (reads === 1) return null;
          if (mode === 'readbackFailure') throw new Error('ambiguous');
          return { isEmailVerificationRequired: mode !== 'readbackFalse' };
        },
        create: async ({ data }) => {
          writes++;
          assert.deepEqual(data, {
            key: 'platform',
            isEmailVerificationRequired: true,
          });
          if (mode === 'createFailure') throw new Error('ambiguous');
        },
      },
      $disconnect: async () => disconnected++,
    };
    if (mode === 'empty')
      assert.deepEqual(await prepareFixture(prisma), {
        verificationRequired: true,
      });
    else await assert.rejects(prepareFixture(prisma));
    assert.equal(disconnected, 1);
    assert.equal(writes, ['users', 'existing'].includes(mode) ? 0 : 1);
  });
}
