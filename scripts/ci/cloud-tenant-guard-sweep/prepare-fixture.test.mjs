import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareFixture } from './prepare-fixture.mjs';

const migratedUser = {
  id: 'genfeed-public-tools',
  handle: 'genfeed-public-tools',
  name: 'Genfeed Public Tools',
  email: null,
  emailVerified: true,
  platformRole: 'USER',
  isDeleted: false,
  isDefault: false,
  isInvited: false,
  banned: false,
  lastUsedOrganizationId: null,
  stripeCustomerId: null,
};
const migratedOrganization = {
  id: 'genfeed-public-tools',
  userId: 'genfeed-public-tools',
  label: 'Genfeed Public Tools',
  slug: 'genfeed-public-tools',
  isDeleted: false,
  isDefault: false,
  isSelected: false,
  billingAccountId: null,
};
const authDelegates = [
  'account',
  'session',
  'member',
  'apiKey',
  'credential',
  'verification',
];
function preparationHarness({
  user = migratedUser,
  organization = migratedOrganization,
  userCount = 1,
  organizationCount = 1,
  authCounts = {},
  mode,
  failedRead,
} = {}) {
  let policy,
    policyReads = 0,
    writes = 0,
    disconnected = 0,
    mutations = 0;
  const baselineRead = (name, value) => {
    if (failedRead === name)
      throw new Error('untrusted-private-database-detail');
    return structuredClone(value);
  };
  const rootDelegate = (name, value, count) => ({
    count: async (...args) => {
      assert.equal(args.length, 0);
      return baselineRead(`${name}.count`, count);
    },
    findUnique: async ({ where, select }) => {
      assert.deepEqual(where, { id: 'genfeed-public-tools' });
      const expected = name === 'user' ? migratedUser : migratedOrganization;
      assert.deepEqual(
        select,
        Object.fromEntries(Object.keys(expected).map((key) => [key, true])),
      );
      return baselineRead(`${name}.findUnique`, value);
    },
  });
  const prisma = {
    user: rootDelegate('user', user, userCount),
    organization: rootDelegate('organization', organization, organizationCount),
    ...Object.fromEntries(
      authDelegates.map((delegate) => [
        delegate,
        {
          count: async (...args) => {
            assert.equal(args.length, 0);
            return baselineRead(`${delegate}.count`, authCounts[delegate] ?? 0);
          },
          findUnique: async () =>
            assert.fail('Never select authentication material'),
        },
      ]),
    ),
    platformSetting: {
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { key: 'platform' });
        policyReads++;
        if (policyReads === 1) {
          baselineRead('platformSetting.findUnique', null);
          return mode === 'existing'
            ? { isEmailVerificationRequired: false }
            : null;
        }
        if (mode === 'readbackFailure')
          throw new Error('untrusted-private-readback-detail');
        return mode === 'readbackFalse'
          ? { isEmailVerificationRequired: false }
          : policy;
      },
      create: async ({ data }) => {
        writes++;
        assert.deepEqual(data, {
          key: 'platform',
          isEmailVerificationRequired: true,
        });
        if (mode === 'createFailure')
          throw new Error('untrusted-private-create-detail');
        policy = data;
      },
    },
    $disconnect: async () => disconnected++,
  };
  for (const name of ['user', 'organization', ...authDelegates])
    for (const method of [
      'create',
      'update',
      'updateMany',
      'delete',
      'deleteMany',
      'upsert',
    ])
      prisma[name][method] = async () => {
        mutations++;
        assert.fail(
          'Never mutate migration principal or authentication material',
        );
      };
  return {
    prisma,
    receipt: () => ({ writes, disconnected, mutations, policyReads }),
  };
}
test('fully migrated non-login principal permits one policy create, true readback and disconnect', async () => {
  const harness = preparationHarness();
  assert.deepEqual(await prepareFixture(harness.prisma), {
    verificationRequired: true,
  });
  assert.deepEqual(harness.receipt(), {
    writes: 1,
    disconnected: 1,
    mutations: 0,
    policyReads: 2,
  });
});
const refusals = [
  ['zero users', { userCount: 0 }],
  ['extra user', { userCount: 2 }],
  ['missing user', { user: null }],
  ['zero organizations', { organizationCount: 0 }],
  ['extra organization', { organizationCount: 2 }],
  ['missing organization', { organization: null }],
  ...Object.entries(migratedUser).map(([key, value]) => [
    `user scalar ${key}`,
    {
      user: {
        ...migratedUser,
        [key]:
          typeof value === 'boolean'
            ? !value
            : key === 'platformRole'
              ? 'SUPERADMIN'
              : key === 'email'
                ? 'unexpected@example.invalid'
                : 'unexpected-value',
      },
    },
  ]),
  ...Object.entries(migratedOrganization).map(([key, value]) => [
    `organization scalar ${key}`,
    {
      organization: {
        ...migratedOrganization,
        [key]: typeof value === 'boolean' ? !value : 'unexpected-value',
      },
    },
  ]),
  ...authDelegates.map((delegate) => [
    `nonzero ${delegate}`,
    { authCounts: { [delegate]: 1 } },
  ]),
  ...[
    'user.count',
    'user.findUnique',
    'organization.count',
    'organization.findUnique',
    ...authDelegates.map((delegate) => `${delegate}.count`),
    'platformSetting.findUnique',
  ].map((failedRead) => [`failed read ${failedRead}`, { failedRead }]),
  ['preexisting platform singleton', { mode: 'existing' }],
];
for (const [label, options] of refusals)
  test(`preparation rejects ${label} before any policy write`, async () => {
    const harness = preparationHarness(options);
    await assert.rejects(prepareFixture(harness.prisma), (error) => {
      assert.match(error.message, /^Fixture /);
      assert.doesNotMatch(error.message, /untrusted-private/);
      return true;
    });
    const receipt = harness.receipt();
    assert.equal(receipt.writes, 0);
    assert.equal(receipt.disconnected, 1);
    assert.equal(receipt.mutations, 0);
  });
for (const mode of ['createFailure', 'readbackFalse', 'readbackFailure'])
  test(`preparation ${mode} stops without ambiguous write replay`, async () => {
    const harness = preparationHarness({ mode });
    await assert.rejects(prepareFixture(harness.prisma), (error) => {
      assert.match(error.message, /^Fixture /);
      assert.doesNotMatch(error.message, /untrusted-private/);
      return true;
    });
    assert.equal(harness.receipt().writes, 1);
    assert.equal(harness.receipt().disconnected, 1);
    assert.equal(harness.receipt().mutations, 0);
  });
