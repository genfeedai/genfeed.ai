import { describe, expect, it, vi } from 'vitest';
import { loadAuthorizedSkillVersions } from './skill-version-loader';

const actor = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function versionRow(id: string, instructionText: string) {
  return {
    contentHash: `hash-${id}`,
    id,
    instructionText,
    skillId: 'skill-1',
  };
}

function prismaFor(input: {
  assignments?: Array<Record<string, unknown>>;
  grants?: Array<Record<string, unknown>>;
  versions?: Array<ReturnType<typeof versionRow>>;
}) {
  return {
    skillAssignment: {
      findMany: vi.fn().mockResolvedValue(input.assignments ?? []),
    },
    skillGrant: {
      findMany: vi.fn().mockResolvedValue(input.grants ?? []),
    },
    skillVersion: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (input.versions ?? []).filter((row) => where.id.in.includes(row.id)),
      ),
    },
  };
}

const document = {
  audience: 'organization',
  currentVersionId: 'sv-draft',
  id: 'skill-1',
  ownerKind: 'organization',
  publishedVersionId: null,
  sharedVersionId: 'sv-shared',
};

describe('loadAuthorizedSkillVersions', () => {
  it('keeps an assigned version ahead of the current draft', async () => {
    const prisma = prismaFor({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-assigned',
          targetKind: 'organization',
        },
      ],
      versions: [versionRow('sv-assigned', 'assigned body')],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as never,
      actor,
      [document],
      new Set(['skill-1']),
    );

    expect(loaded.get('skill-1')).toMatchObject({
      id: 'sv-assigned',
      instructionText: 'assigned body',
    });
  });

  it('prefers the caller grant over an organization grant and ignores a revoked grant', async () => {
    const prisma = prismaFor({
      grants: [
        {
          recipientKind: 'organization',
          revokedAt: null,
          skillId: 'skill-1',
          skillVersionId: 'sv-org',
        },
        {
          recipientKind: 'user',
          revokedAt: null,
          skillId: 'skill-1',
          skillVersionId: 'sv-user',
        },
        {
          recipientKind: 'user',
          revokedAt: new Date('2026-09-01T00:00:00.000Z'),
          skillId: 'skill-1',
          skillVersionId: 'sv-revoked',
        },
      ],
      versions: [versionRow('sv-user', 'granted body')],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as never,
      actor,
      [{ ...document, sharedVersionId: 'sv-shared' }],
      new Set(),
    );

    expect(prisma.skillGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
    expect(loaded.get('skill-1')?.instructionText).toBe('granted body');
  });

  it('reuses a stored execution pin after the shared pointer moves', async () => {
    const prisma = prismaFor({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-activated',
          targetKind: 'organization',
        },
      ],
      versions: [versionRow('sv-first', 'first body')],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as never,
      actor,
      [document],
      new Set(),
      [
        {
          contentHash: 'hash-sv-first',
          skillId: 'skill-1',
          skillVersionId: 'sv-first',
        },
      ],
    );

    expect(loaded.get('skill-1')).toMatchObject({
      id: 'sv-first',
      instructionText: 'first body',
    });
  });

  it('does not load the current draft for a caller who only has publication access', async () => {
    const prisma = prismaFor({
      versions: [versionRow('sv-draft', 'draft body')],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as never,
      actor,
      [
        {
          ...document,
          audience: 'public',
          currentVersionId: 'sv-draft',
          publishedVersionId: null,
          sharedVersionId: null,
        },
      ],
      new Set(),
    );

    expect(loaded.has('skill-1')).toBe(false);
    expect(prisma.skillVersion.findMany).not.toHaveBeenCalled();
  });

  it('drops a version row that belongs to a different skill', async () => {
    const prisma = prismaFor({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-assigned',
          targetKind: 'organization',
        },
      ],
      versions: [
        {
          contentHash: 'hash-sv-assigned',
          id: 'sv-assigned',
          instructionText: 'other skill',
          skillId: 'skill-other',
        },
      ],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as never,
      actor,
      [document],
      new Set(),
    );

    expect(loaded.has('skill-1')).toBe(false);
  });
});
