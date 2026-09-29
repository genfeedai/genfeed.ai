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
          recipientOrganizationId: 'org-1',
          revokedAt: null,
          skillId: 'skill-1',
          skillVersionId: 'sv-org',
        },
        {
          recipientKind: 'user',
          recipientUserId: 'user-1',
          revokedAt: null,
          skillId: 'skill-1',
          skillVersionId: 'sv-user',
        },
        {
          recipientKind: 'user',
          recipientUserId: 'user-1',
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
        where: expect.objectContaining({
          OR: [
            { recipientKind: 'user', recipientUserId: 'user-1' },
            {
              recipientKind: 'organization',
              recipientOrganizationId: 'org-1',
            },
            {
              recipientBrandId: 'brand-1',
              recipientKind: 'brand',
              recipientOrganizationId: 'org-1',
            },
          ],
          revokedAt: null,
        }),
      }),
    );
    expect(loaded.get('skill-1')?.instructionText).toBe('granted body');
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

  it('keeps a use-only grant for execution and the shared version for reading', async () => {
    const grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'version-use-only',
      },
    ];
    const versions = [
      versionRow('version-shared', 'shared body'),
      versionRow('version-use-only', 'use only body'),
    ];
    const skill = [{ ...document, sharedVersionId: 'version-shared' }];
    const executed = await loadAuthorizedSkillVersions(
      prismaFor({ grants, versions }) as never,
      actor,
      skill,
      new Set(),
    );
    const readable = await loadAuthorizedSkillVersions(
      prismaFor({ grants, versions }) as never,
      actor,
      skill,
      new Set(),
      [],
      'read',
    );

    expect(executed.get('skill-1')?.instructionText).toBe('use only body');
    expect(readable.get('skill-1')?.instructionText).toBe('shared body');
  });

  it('reads a use_and_read grant version instead of the shared pointer', async () => {
    const loaded = await loadAuthorizedSkillVersions(
      prismaFor({
        grants: [
          {
            access: 'use_and_read',
            recipientBrandId: null,
            recipientKind: 'user',
            recipientOrganizationId: null,
            recipientUserId: 'user-1',
            revokedAt: null,
            skillId: 'skill-1',
            skillVersionId: 'version-read',
          },
        ],
        versions: [
          versionRow('version-shared', 'shared body'),
          versionRow('version-read', 'granted read body'),
        ],
      }) as never,
      actor,
      [{ ...document, sharedVersionId: 'version-shared' }],
      new Set(),
      [],
      'read',
    );

    expect(loaded.get('skill-1')?.instructionText).toBe('granted read body');
  });

  it('reads the system catalog version while a use-only grant still selects execution', async () => {
    const skill = [
      {
        allowsCatalogRead: true,
        audience: 'private',
        currentVersionId: 'version-catalog',
        id: 'skill-1',
        ownerKind: 'system',
        publishedVersionId: null,
        sharedVersionId: null,
      },
    ];
    const versions = [
      versionRow('version-catalog', 'catalog body'),
      versionRow('version-use-only', 'use only body'),
    ];
    const grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'version-use-only',
      },
    ];

    const readable = await loadAuthorizedSkillVersions(
      prismaFor({ versions }) as never,
      actor,
      skill,
      new Set(),
      [],
      'read',
    );
    const executed = await loadAuthorizedSkillVersions(
      prismaFor({ grants, versions }) as never,
      actor,
      skill,
      new Set(),
    );

    expect(readable.get('skill-1')?.instructionText).toBe('catalog body');
    expect(executed.get('skill-1')?.instructionText).toBe('use only body');
  });
});
