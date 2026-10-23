import { readLearningArmExclusionsV1 } from '@api/collections/posts/services/post-account-learning-exclusions.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compatibility: vi.fn(),
  project: vi.fn(),
}));
vi.mock(
  '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util',
  () => ({ projectApprovedBrandIdentitySnapshot: mocks.project }),
);
vi.mock('@api/services/harness/branded-generation-compatibility', () => ({
  deriveBrandLearningCompatibility: mocks.compatibility,
}));

const at = new Date('2026-10-03T12:00:00.000Z');
const scope = { organizationId: 'org', brandId: 'brand' };
const unavailable = [
  { armId: 'question-example-v1', reasonCode: 'brand_identity_unavailable' },
  { armId: 'proof-steps-v1', reasonCode: 'brand_identity_unavailable' },
];

describe('readLearningArmExclusionsV1', () => {
  const brandOsRevision = { findMany: vi.fn() };
  const prisma = { brandOsRevision } as unknown as PrismaService;
  beforeEach(() => {
    vi.clearAllMocks();
    brandOsRevision.findMany.mockResolvedValue([{ id: 'revision' }]);
    mocks.project.mockReturnValue({ contentHash: 'hash' });
  });

  it('reads only the brand approved revisions inside the tenant scope', async () => {
    mocks.compatibility.mockReturnValue([{ excludedArmIds: [] }, []]);
    await readLearningArmExclusionsV1(prisma, scope, at);
    expect(brandOsRevision.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        organizationId: 'org',
        brandId: 'brand',
        status: 'APPROVED',
      },
      take: 2,
    });
    expect(mocks.project).toHaveBeenCalledWith(
      { id: 'revision' },
      at.toISOString(),
    );
    expect(mocks.compatibility).toHaveBeenCalledWith(
      { contentHash: 'hash' },
      'text',
    );
  });

  it('returns no exclusions for a compatible brand', async () => {
    mocks.compatibility.mockReturnValue([{ excludedArmIds: [] }, []]);
    await expect(
      readLearningArmExclusionsV1(prisma, scope, at),
    ).resolves.toEqual([]);
  });

  it('pairs each excluded arm with its own diagnostic code', async () => {
    mocks.compatibility.mockReturnValue([
      { excludedArmIds: ['question-example-v1', 'proof-steps-v1'] },
      [{ code: 'learning.first' }, { code: 'learning.second' }],
    ]);
    await expect(
      readLearningArmExclusionsV1(prisma, scope, at),
    ).resolves.toEqual([
      { armId: 'question-example-v1', reasonCode: 'learning.first' },
      { armId: 'proof-steps-v1', reasonCode: 'learning.second' },
    ]);
  });

  it('gives a veto of both arms the shared diagnostic code', async () => {
    mocks.compatibility.mockReturnValue([
      { excludedArmIds: ['question-example-v1', 'proof-steps-v1'] },
      [{ code: 'learning.compatibility_unverified' }],
    ]);
    await expect(
      readLearningArmExclusionsV1(prisma, scope, at),
    ).resolves.toEqual([
      {
        armId: 'question-example-v1',
        reasonCode: 'learning.compatibility_unverified',
      },
      {
        armId: 'proof-steps-v1',
        reasonCode: 'learning.compatibility_unverified',
      },
    ]);
  });

  it('falls back to a generic code when an exclusion has no diagnostic', async () => {
    mocks.compatibility.mockReturnValue([
      { excludedArmIds: ['proof-steps-v1'] },
      [],
    ]);
    await expect(
      readLearningArmExclusionsV1(prisma, scope, at),
    ).resolves.toEqual([
      { armId: 'proof-steps-v1', reasonCode: 'learning_incompatible' },
    ]);
  });

  it.each([
    ['no approved revision', []],
    ['more than one approved revision', [{ id: 'a' }, { id: 'b' }]],
  ])('excludes every learned arm with %s', async (_name, revisions) => {
    brandOsRevision.findMany.mockResolvedValue(revisions);
    await expect(
      readLearningArmExclusionsV1(prisma, scope, at),
    ).resolves.toEqual(unavailable);
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it('excludes every learned arm when reading or projecting fails', async () => {
    mocks.project.mockImplementation(() => {
      throw new Error('bad snapshot');
    });
    await expect(
      readLearningArmExclusionsV1(prisma, scope, at),
    ).resolves.toEqual(unavailable);
    brandOsRevision.findMany.mockRejectedValue(new Error('down'));
    await expect(
      readLearningArmExclusionsV1(prisma, scope, at),
    ).resolves.toEqual(unavailable);
  });
});
