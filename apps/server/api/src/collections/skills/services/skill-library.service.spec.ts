import { BUILT_IN_SKILL_CATALOG } from '@api/collections/skills/constants/skill-validation.constant';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { parseSkillPackageManifest } from '@api/collections/skills/utils/skill-package-manifest.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SkillVersionSourceEvidenceV1 } from '@genfeedai/contracts/interfaces/ai/skill-version-read.interface';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface VersionRow {
  contentHash: string;
  id: string;
  instructionText: string;
  skillId: string;
}

const versions: VersionRow[] = [
  {
    contentHash: 'hash-v1',
    id: 'sv-1',
    instructionText: 'version one',
    skillId: 'skill-1',
  },
  {
    contentHash: 'hash-v2',
    id: 'sv-2',
    instructionText: 'version two',
    skillId: 'skill-1',
  },
  {
    contentHash: 'hash-brand',
    id: 'sv-brand',
    instructionText: 'brand private body',
    skillId: 'skill-1',
  },
  {
    contentHash: 'hash-denied',
    id: 'sv-denied',
    instructionText: 'pinned denial',
    skillId: 'skill-2',
  },
  {
    contentHash: 'hash-live',
    id: 'sv-live',
    instructionText: 'live draft',
    skillId: 'skill-3',
  },
  {
    contentHash: 'hash-system',
    id: 'sv-system',
    instructionText: 'built in body',
    skillId: 'skill-system',
  },
  {
    contentHash: 'hash-system-use',
    id: 'sv-system-use',
    instructionText: 'system use only',
    skillId: 'skill-system',
  },
];

const state = {
  assignments: [] as Array<{
    skillId: string;
    skillVersionId: string;
    targetKind: string;
  }>,
  grants: [] as Array<Record<string, unknown>>,
  roleKey: 'member',
};

const prisma = {
  $executeRaw: vi.fn(),
  $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  ),
  member: {
    findFirst: vi.fn(async () => ({ brands: [], roleKey: state.roleKey })),
  },
  skill: {
    findMany: vi.fn(),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      audience: data.audience,
      brandId: data.brandId ?? null,
      config: data.config,
      currentVersionId: null,
      id: 'skill-created',
      isDeleted: false,
      isQuarantined: false,
      label: data.label,
      organizationId: data.organizationId,
      ownerKind: data.ownerKind,
      ownerUserId: data.ownerUserId,
      publishedVersionId: null,
      revision: 1,
      sharedVersionId: null,
    })),
    findFirst: vi.fn(),
  },
  skillAssignment: {
    findMany: vi.fn(async () => state.assignments),
  },
  skillGrant: {
    findMany: vi.fn(async () => state.grants),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  skillResolution: { create: vi.fn() },
  skillVersion: {
    findFirst: vi.fn(
      async (query: { where: { id: string } }) =>
        versions.find((row) => row.id === query.where.id) ?? null,
    ),
    findMany: vi.fn(async (query: { where: { id: { in: string[] } } }) =>
      versions.filter((row) => query.where.id.in.includes(row.id)),
    ),
  },
};

const actor = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };

function skillDocument(overrides: Record<string, unknown> = {}): SkillDocument {
  const config = {
    defaultInstructions: 'version two',
    description: 'Voice guide',
    name: 'Voice',
    slug: 'voice',
    source: 'custom',
    systemPromptTemplate: 'version two',
  };
  return {
    ...config,
    audience: 'organization',
    config,
    currentVersionId: 'sv-2',
    id: 'skill-1',
    isQuarantined: false,
    organizationId: 'org-1',
    ownerKind: 'organization',
    ownerUserId: null,
    publishedVersionId: null,
    sharedVersionId: 'sv-1',
    ...overrides,
  } as unknown as SkillDocument;
}

describe('SkillLibraryService authorized versions', () => {
  const service = new SkillLibraryService(prisma as unknown as PrismaService);

  beforeEach(() => {
    state.assignments = [];
    state.grants = [];
    state.roleKey = 'member';
    vi.clearAllMocks();
  });

  it('shows a reader the shared version instead of the current draft', async () => {
    const [visible] = await service.present(actor, [skillDocument()]);

    expect(visible?.systemPromptTemplate).toBe('version one');
    expect(visible?.defaultInstructions).toBe('version one');
  });

  it('hides instruction text from a use-only grant and still executes that version', async () => {
    state.grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        skillId: 'skill-1',
        skillVersionId: 'sv-1',
      },
    ];
    const granted = skillDocument({
      audience: 'private',
      organizationId: null,
      ownerKind: 'user',
      ownerUserId: 'user-2',
      sharedVersionId: null,
    });

    const [visible] = await service.present(actor, [granted]);
    const decision = await service.authorizeResolved(actor, [granted]);

    expect(visible?.systemPromptTemplate).toBeUndefined();
    expect(visible?.canRead).toBe(false);
    expect(visible?.canUse).toBe(true);
    expect(decision.included[0]?.systemPromptTemplate).toBe('version one');
    expect(decision.versions).toEqual([
      {
        contentHash: 'hash-v1',
        skillId: 'skill-1',
        skillVersionId: 'sv-1',
      },
    ]);
  });

  it('keeps the first execution and its retry on v1 after activation moves the pointer', async () => {
    state.assignments = [
      {
        skillId: 'skill-1',
        skillVersionId: 'sv-1',
        targetKind: 'organization',
      },
    ];
    const first = await service.authorizeResolved(actor, [skillDocument()]);
    state.assignments = [
      {
        skillId: 'skill-1',
        skillVersionId: 'sv-2',
        targetKind: 'organization',
      },
    ];
    const retry = await service.authorizeResolved(
      actor,
      [skillDocument()],
      [
        {
          contentHash: 'hash-v1',
          skillId: 'skill-1',
          skillVersionId: 'sv-1',
        },
      ],
    );
    const later = await service.authorizeResolved(actor, [skillDocument()]);

    expect(first.included[0]?.systemPromptTemplate).toBe('version one');
    expect(retry.included[0]?.systemPromptTemplate).toBe('version one');
    expect(retry.versions[0]?.skillVersionId).toBe('sv-1');
    expect(later.included[0]?.systemPromptTemplate).toBe('version two');
    await service.recordResolution(actor, first.versions, first.excluded);
    expect(prisma.skillResolution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                contentHash: 'hash-v1',
                skillVersionId: 'sv-1',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('forks the authorized version instead of the current draft', async () => {
    prisma.skill.findFirst.mockImplementation(
      async (query: { where?: { id?: string } }) => {
        if (query.where?.id === 'skill-1') {
          return {
            audience: 'organization',
            brandId: null,
            config: {
              defaultInstructions: 'version two',
              description: 'Voice guide',
              name: 'Voice',
              slug: 'voice',
              source: 'custom',
              systemPromptTemplate: 'version two',
            },
            currentVersionId: 'sv-2',
            id: 'skill-1',
            isDeleted: false,
            isQuarantined: false,
            label: 'Voice',
            organizationId: 'org-1',
            ownerKind: 'organization',
            ownerUserId: null,
            publishedVersionId: null,
            revision: 2,
            sharedVersionId: 'sv-1',
          };
        }
        return null;
      },
    );

    const forked = await service.fork(actor, 'skill-1');

    expect(forked.systemPromptTemplate).toBe('version one');
    expect(prisma.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: null,
          ownerKind: 'user',
          ownerUserId: 'user-1',
        }),
      }),
    );
  });

  it('creates a personal skill for its owner and rejects a private organization skill', async () => {
    const created = await service.create(actor, {
      description: 'Mine',
      instructions: 'Personal instructions',
      name: 'Mine',
      slug: 'mine',
    });

    expect(created.organizationId).toBeNull();
    expect(created.ownerUserId).toBe('user-1');
    expect(created.audience).toBe('private');
    expect(prisma.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: null,
          ownerKind: 'user',
        }),
      }),
    );

    state.roleKey = 'admin';
    await expect(
      service.create(actor, {
        audience: 'private',
        description: 'Hidden org skill',
        instructions: 'Secret',
        name: 'Hidden',
        ownerKind: 'organization',
        slug: 'hidden',
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it('shows the shared body when another brand holds a private version grant', async () => {
    state.grants = [
      {
        access: 'use_and_read',
        recipientBrandId: 'brand-b',
        recipientKind: 'brand',
        recipientOrganizationId: 'org-1',
        recipientUserId: null,
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-brand',
      },
    ];

    const [visible] = await service.present(actor, [skillDocument()]);
    const decision = await service.authorizeResolved(actor, [skillDocument()]);

    expect(visible?.systemPromptTemplate).toBe('version one');
    expect(visible?.canRead).toBe(true);
    expect(decision.included[0]?.systemPromptTemplate).toBe('version one');
    expect(decision.versions[0]?.skillVersionId).toBe('sv-1');

    const [published] = await service.present(actor, [
      skillDocument({
        audience: 'public',
        publishedVersionId: 'sv-1',
        sharedVersionId: null,
      }),
    ]);
    expect(published?.canRead).toBe(true);
    expect(published?.systemPromptTemplate).toBe('version one');
  });

  it('shows a use_and_read grant and still hides a use-only grant from the document', async () => {
    const privateSkill = skillDocument({
      audience: 'private',
      organizationId: null,
      ownerKind: 'user',
      ownerUserId: 'user-2',
      sharedVersionId: null,
    });
    state.grants = [
      {
        access: 'use_and_read',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-1',
      },
    ];

    const [readable] = await service.present(actor, [privateSkill]);
    expect(readable?.canRead).toBe(true);
    expect(readable?.canUse).toBe(true);
    expect(readable?.systemPromptTemplate).toBe('version one');

    state.grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-1',
      },
    ];
    const [useOnly] = await service.present(actor, [privateSkill]);
    const executed = await service.authorizeResolved(actor, [privateSkill]);

    expect(useOnly?.canRead).toBe(false);
    expect(useOnly?.canUse).toBe(true);
    expect(useOnly?.systemPromptTemplate).toBeUndefined();
    expect(executed.included[0]?.systemPromptTemplate).toBe('version one');
  });

  it('does not apply a grant addressed to another user, brand, or organization', async () => {
    const privateSkill = skillDocument({
      audience: 'private',
      organizationId: null,
      ownerKind: 'user',
      ownerUserId: 'user-2',
      publishedVersionId: null,
      sharedVersionId: null,
    });
    const mismatches = [
      {
        access: 'use_and_read',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-other',
      },
      {
        access: 'use',
        recipientBrandId: 'brand-b',
        recipientKind: 'brand',
        recipientOrganizationId: 'org-1',
        recipientUserId: null,
      },
      {
        access: 'use_and_read',
        recipientBrandId: null,
        recipientKind: 'organization',
        recipientOrganizationId: 'org-other',
        recipientUserId: null,
      },
    ];

    for (const grant of mismatches) {
      state.grants = [
        {
          ...grant,
          revokedAt: null,
          skillId: 'skill-1',
          skillVersionId: 'sv-brand',
        },
      ];
      const visible = await service.present(actor, [privateSkill]);
      const decision = await service.authorizeResolved(actor, [privateSkill]);
      expect(visible).toEqual([]);
      expect(decision.included).toEqual([]);
    }
  });

  it('shows the captured system catalog body and still executes a different use-only grant', async () => {
    const catalog = skillDocument({
      audience: 'private',
      currentVersionId: 'sv-1',
      isBuiltIn: true,
      organizationId: null,
      ownerKind: 'system',
      publishedVersionId: null,
      sharedVersionId: null,
      source: 'built_in',
    });

    const [visible] = await service.present(actor, [catalog]);

    expect(visible?.canRead).toBe(true);
    expect(visible?.canUse).toBe(true);
    expect(visible?.canExport).toBe(true);
    expect(visible?.systemPromptTemplate).toBe('version one');

    state.grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-brand',
      },
    ];
    const [withGrant] = await service.present(actor, [catalog]);
    const decision = await service.authorizeResolved(actor, [catalog]);

    expect(withGrant?.systemPromptTemplate).toBe('version one');
    expect(decision.included[0]?.systemPromptTemplate).toBe(
      'brand private body',
    );
  });

  it('shows and exports the system catalog version without a use-only body', async () => {
    const systemSkill = skillDocument({
      audience: 'private',
      currentVersionId: 'sv-system',
      defaultInstructions: 'draft leak',
      id: 'skill-system',
      isBuiltIn: true,
      organizationId: null,
      ownerKind: 'system',
      ownerUserId: null,
      publishedVersionId: null,
      sharedVersionId: null,
      systemPromptTemplate: 'draft leak',
    });
    state.grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-system',
        skillVersionId: 'sv-system-use',
      },
    ];

    const [visible] = await service.present(actor, [systemSkill]);
    const decision = await service.authorizeResolved(actor, [systemSkill]);

    expect(visible?.canRead).toBe(true);
    expect(visible?.canUse).toBe(true);
    expect(visible?.systemPromptTemplate).toBe('built in body');
    expect(decision.included[0]?.systemPromptTemplate).toBe('system use only');

    prisma.skill.findFirst.mockResolvedValueOnce({
      audience: 'private',
      config: { slug: 'built-in', systemPromptTemplate: 'draft leak' },
      currentVersionId: 'sv-system',
      id: 'skill-system',
      isDeleted: false,
      isQuarantined: false,
      label: 'Built in',
      organizationId: null,
      ownerKind: 'system',
      ownerUserId: null,
      publishedVersionId: null,
      revision: 1,
      sharedVersionId: null,
    });
    await expect(service.export(actor, 'skill-system')).resolves.toEqual({
      contentHash: 'hash-system',
      instructions: 'built in body',
      versionId: 'sv-system',
    });
  });

  it('shows the shared body when a matching use-only grant targets another version', async () => {
    state.grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-brand',
      },
    ];

    const [visible] = await service.present(actor, [skillDocument()]);
    const decision = await service.authorizeResolved(actor, [skillDocument()]);

    expect(visible?.systemPromptTemplate).toBe('version one');
    expect(visible?.skillVersionId).toBe('sv-1');
    expect(visible?.canRead).toBe(true);
    expect(decision.included[0]?.systemPromptTemplate).toBe(
      'brand private body',
    );
    expect(decision.versions[0]?.skillVersionId).toBe('sv-brand');
  });

  it('shows the published body when a public skill also has a use-only grant', async () => {
    state.grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-brand',
      },
    ];
    const published = skillDocument({
      audience: 'public',
      publishedVersionId: 'sv-1',
      sharedVersionId: null,
    });

    const [visible] = await service.present(actor, [published]);
    const decision = await service.authorizeResolved(actor, [published]);

    expect(visible?.systemPromptTemplate).toBe('version one');
    expect(decision.included[0]?.systemPromptTemplate).toBe(
      'brand private body',
    );
  });

  it('shows the use_and_read version and lets an owner keep the current draft', async () => {
    state.grants = [
      {
        access: 'use_and_read',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-brand',
      },
    ];

    const [readable] = await service.present(actor, [skillDocument()]);
    expect(readable?.canRead).toBe(true);
    expect(readable?.systemPromptTemplate).toBe('brand private body');

    state.roleKey = 'admin';
    state.grants = [
      {
        access: 'use',
        recipientBrandId: null,
        recipientKind: 'user',
        recipientOrganizationId: null,
        recipientUserId: 'user-1',
        revokedAt: null,
        skillId: 'skill-1',
        skillVersionId: 'sv-brand',
      },
    ];
    const [owned] = await service.present(actor, [skillDocument()]);
    expect(owned?.canEdit).toBe(true);
    expect(owned?.systemPromptTemplate).toBe('version two');
  });

  it('does not authorize a private skill after its grant is revoked', async () => {
    const foreign = skillDocument({
      audience: 'private',
      organizationId: null,
      ownerKind: 'user',
      ownerUserId: 'user-2',
      sharedVersionId: null,
    });

    const decision = await service.authorizeResolved(actor, [foreign]);

    expect(decision.included).toEqual([]);
    expect(prisma.skillGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
  });

  it('records a denied skill beside an allowed one without reading the live draft', async () => {
    const denied = skillDocument({
      audience: 'organization',
      currentVersionId: 'sv-live',
      id: 'skill-2',
      isQuarantined: true,
      sharedVersionId: 'sv-denied',
    });
    const decision = await service.authorizeResolved(actor, [
      skillDocument(),
      denied,
    ]);

    expect(decision.versions).toEqual([
      {
        contentHash: 'hash-v1',
        skillId: 'skill-1',
        skillVersionId: 'sv-1',
      },
    ]);
    expect(decision.excluded).toEqual([
      {
        contentHash: 'hash-denied',
        reason: 'access-revoked-or-unusable',
        skillId: 'skill-2',
        skillVersionId: 'sv-denied',
      },
    ]);
    await service.recordResolution(actor, decision.versions, decision.excluded);
    expect(prisma.skillResolution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                contentHash: 'hash-v1',
                exclusionReason: null,
                inclusion: 'included',
                skillId: 'skill-1',
                skillVersionId: 'sv-1',
              }),
              expect.objectContaining({
                contentHash: 'hash-denied',
                exclusionReason: 'access-revoked-or-unusable',
                inclusion: 'excluded',
                skillId: 'skill-2',
                skillVersionId: 'sv-denied',
              }),
            ],
          },
        }),
      }),
    );
    expect(
      JSON.stringify(prisma.skillResolution.create.mock.calls),
    ).not.toContain('sv-live');
  });

  it('records an all-denied revoked retry from the pinned version', async () => {
    const revoked = skillDocument({
      audience: 'private',
      currentVersionId: 'sv-live',
      id: 'skill-2',
      organizationId: null,
      ownerKind: 'user',
      ownerUserId: 'user-2',
      sharedVersionId: null,
    });
    const decision = await service.authorizeResolved(
      actor,
      [revoked],
      [
        {
          contentHash: 'hash-denied',
          skillId: 'skill-2',
          skillVersionId: 'sv-denied',
        },
      ],
    );

    expect(decision.included).toEqual([]);
    expect(decision.excluded).toEqual([
      {
        contentHash: 'hash-denied',
        reason: 'access-revoked-or-unusable',
        skillId: 'skill-2',
        skillVersionId: 'sv-denied',
      },
    ]);
    await service.recordResolution(actor, decision.versions, decision.excluded);
    expect(prisma.skillResolution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              {
                contentHash: 'hash-denied',
                exclusionReason: 'access-revoked-or-unusable',
                inclusion: 'excluded',
                origin: 'selection',
                skillId: 'skill-2',
                skillVersionId: 'sv-denied',
              },
            ],
          },
        }),
      }),
    );
  });

  it('keeps a versionless denial without inventing the current draft', async () => {
    const unversioned = skillDocument({
      audience: 'private',
      currentVersionId: 'sv-live',
      id: 'skill-3',
      organizationId: null,
      ownerKind: 'user',
      ownerUserId: 'user-2',
      publishedVersionId: null,
      sharedVersionId: null,
    });
    const decision = await service.authorizeResolved(actor, [unversioned]);

    expect(decision.included).toEqual([]);
    expect(decision.excluded).toEqual([
      {
        reason: 'access-revoked-or-unusable',
        skillId: 'skill-3',
      },
    ]);
    await service.recordResolution(actor, decision.versions, decision.excluded);
    expect(prisma.skillResolution.create).not.toHaveBeenCalled();
    expect(prisma.skill.findMany).not.toHaveBeenCalled();
  });

  it('revokes one live grant on the authorized skill and rejects other callers', async () => {
    const skillRow = {
      audience: 'organization',
      config: { slug: 'voice' },
      currentVersionId: 'sv-1',
      id: 'skill-1',
      isDeleted: false,
      isQuarantined: false,
      label: 'Voice',
      organizationId: 'org-1',
      ownerKind: 'organization',
      ownerUserId: null,
      publishedVersionId: null,
      revision: 1,
      sharedVersionId: 'sv-1',
    };
    state.roleKey = 'admin';
    prisma.skill.findFirst.mockResolvedValue(skillRow);

    await service.revoke(actor, 'skill-1', 'grant-1');

    expect(prisma.skillGrant.updateMany).toHaveBeenCalledWith({
      data: { revokedAt: expect.any(Date) },
      where: { id: 'grant-1', revokedAt: null, skillId: 'skill-1' },
    });

    state.roleKey = 'member';
    prisma.skillGrant.updateMany.mockClear();
    await expect(
      service.revoke(actor, 'skill-1', 'grant-9'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.skillGrant.updateMany).not.toHaveBeenCalled();

    state.roleKey = 'admin';
    prisma.skillGrant.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.revoke(actor, 'skill-1', 'grant-missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.skillGrant.updateMany).toHaveBeenCalledWith({
      data: { revokedAt: expect.any(Date) },
      where: { id: 'grant-missing', revokedAt: null, skillId: 'skill-1' },
    });
  });
});

describe('SkillLibraryService ordinary validated package import', () => {
  function input(slug = 'Personal-Upload') {
    return {
      slug,
      package: {
        format: 'files',
        files: [
          {
            path: 'SKILL.md',
            content:
              '---\nname: Personal upload\ndescription: Original package\nmetadata: {version: "v1"}\nrequiredProviders: [paid]\ntoolOverrides: [publish]\nownerKind: system\n---\nPrivate instructions',
          },
        ],
      },
    };
  }
  function fixture() {
    const order: string[] = [];
    const lock = [{ id: 'user-1', isolation: 'read committed' }];
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(
        async (strings: TemplateStringsArray, ..._values: unknown[]) => {
          const sql = strings.join('?');
          order.push(sql.includes('FOR UPDATE') ? 'lock' : 'duplicate');
          return sql.includes('FOR UPDATE') ? lock : [];
        },
      ),
      organization: {
        findFirst: vi.fn(async () => {
          order.push('organization');
          return { id: 'org-1' };
        }),
      },
      member: {
        findFirst: vi.fn(async () => {
          order.push('member');
          return { id: 'member-1', brands: [], roleKey: 'member' };
        }),
      },
      skill: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          order.push('create');
          return {
            ...data,
            id: 'new-import',
            currentVersionId: 'captured-import',
            publishedVersionId: null,
            sharedVersionId: null,
            isQuarantined: false,
            revision: 1,
          };
        }),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      skillVersion: {
        create: vi.fn(),
        findMany: vi.fn(async () => [
          {
            id: 'captured-import',
            skillId: 'new-import',
            instructionText: 'Private instructions',
            contentHash: 'captured-hash',
          },
        ]),
      },
      skillGrant: { findMany: vi.fn(async () => []) },
      skillAssignment: { findMany: vi.fn(async () => []) },
    };
    const client = {
      ...tx,
      $transaction: vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    return {
      order,
      tx,
      client,
      lock,
      service: new SkillLibraryService(client as unknown as PrismaService),
    };
  }
  it('parses before opening capture transaction and rejects legacy/untrusted packages', async () => {
    const f = fixture();
    await expect(
      f.service.importValidatedPackage(actor, {
        slug: 'unsafe',
        name: 'Legacy',
        ownerKind: 'system',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.client.$transaction).not.toHaveBeenCalled();
    expect(f.tx.skill.create).not.toHaveBeenCalled();
  });
  it('locks the canonical user, verifies live context and normalized duplicate scope before one final private create', async () => {
    const f = fixture();
    const parsed = parseSkillPackageManifest(input());
    const result = await f.service.importValidatedPackage(actor, input());
    expect(f.order).toEqual([
      'lock',
      'organization',
      'member',
      'duplicate',
      'create',
    ]);
    expect(f.tx.$queryRaw.mock.calls[0][0].join('?')).toContain(
      'current_setting',
    );
    expect(f.tx.$queryRaw.mock.calls[0].slice(1)).toEqual(['user-1']);
    expect(f.tx.organization.findFirst).toHaveBeenCalledWith({
      where: { id: 'org-1', isDeleted: false },
      select: { id: true },
    });
    expect(f.tx.member.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'org-1',
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    expect(f.tx.$queryRaw.mock.calls[1][0].join('?')).toContain('lower');
    expect(f.tx.$queryRaw.mock.calls[1].slice(1)).toEqual([
      'user-1',
      'personal-upload',
    ]);
    expect(f.tx.skill.create).toHaveBeenCalledTimes(1);
    expect(f.tx.skill.create.mock.calls[0][0].data).toEqual({
      audience: 'private',
      brandId: null,
      organizationId: null,
      ownerKind: 'user',
      ownerUserId: 'user-1',
      isDeleted: false,
      isQuarantined: false,
      label: 'Personal upload',
      config: {
        category: 'content',
        channels: ['general'],
        modalities: ['text'],
        workflowStage: 'creation',
        slug: 'personal-upload',
        name: 'Personal upload',
        description: 'Original package',
        version: 'v1',
        source: 'imported',
        status: 'draft',
        isBuiltIn: false,
        isEnabled: true,
        requiredProviders: [],
        toolOverrides: [],
        defaultInstructions: 'Private instructions',
        systemPromptTemplate: 'Private instructions',
        files: parsed.files,
        checksum: parsed.packageChecksum,
        importProvenance: {
          format: 'genfeed.skill.ordinary-upload.v1',
          importedByUserId: 'user-1',
          packageChecksum: parsed.packageChecksum,
        },
      },
    });
    expect(result.currentVersionId).toBe('captured-import');
    expect(f.tx.skill.update).not.toHaveBeenCalled();
    expect(f.tx.skillVersion.create).not.toHaveBeenCalled();
  });
  it.each([
    'missing-user',
    'wrong-user',
    'multiple-users',
    'deleted-organization',
    'inactive-member',
    'wrong-isolation',
    'duplicate',
  ])('fails closed for %s before creating', async (reason) => {
    const f = fixture();
    if (reason === 'missing-user') f.lock.splice(0);
    if (reason === 'wrong-user') f.lock[0].id = 'legacy-auth-user';
    if (reason === 'multiple-users') f.lock.push({ ...f.lock[0] });
    if (reason === 'deleted-organization')
      f.tx.organization.findFirst.mockResolvedValueOnce(null as never);
    if (reason === 'inactive-member')
      f.tx.member.findFirst.mockResolvedValueOnce(null as never);
    if (reason === 'wrong-isolation') f.lock[0].isolation = 'repeatable read';
    if (reason === 'duplicate')
      f.tx.$queryRaw
        .mockResolvedValueOnce(f.lock)
        .mockResolvedValueOnce([{ id: 'existing' }] as never);
    await expect(
      f.service.importValidatedPackage(actor, input()),
    ).rejects.toThrow();
    expect(f.tx.skill.create).not.toHaveBeenCalled();
    if (reason === 'missing-user' || reason === 'wrong-isolation')
      expect(f.tx.member.findFirst).not.toHaveBeenCalled();
  });
  it('checks membership for the exact requested organization and refuses reserved catalog slugs', async () => {
    const f = fixture();
    f.tx.member.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      f.service.importValidatedPackage(
        { ...actor, organizationId: 'other-org' },
        input(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.tx.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'other-org',
          userId: 'user-1',
        }),
      }),
    );
    const reserved = fixture();
    await expect(
      reserved.service.importValidatedPackage(
        actor,
        input(BUILT_IN_SKILL_CATALOG[0].slug),
      ),
    ).rejects.toThrow();
    expect(reserved.tx.skill.create).not.toHaveBeenCalled();
  });
  it('propagates transactional failure without repair, replacement or a manufactured version', async () => {
    const f = fixture();
    f.tx.skill.create.mockRejectedValueOnce(new Error('capture failure'));
    await expect(
      f.service.importValidatedPackage(actor, input()),
    ).rejects.toThrow('capture failure');
    expect(f.tx.skill.create).toHaveBeenCalledTimes(1);
    expect(f.tx.skill.update).not.toHaveBeenCalled();
    expect(f.tx.skillVersion.create).not.toHaveBeenCalled();
  });
  it('keeps use-only bodies hidden and uses only the granted immutable version for readable derivatives', async () => {
    const f = fixture();
    const imported = await f.service.importValidatedPackage(actor, input());
    const recipient = { ...actor, userId: 'recipient' };
    const grant = {
      skillId: 'new-import',
      skillVersionId: 'captured-import',
      recipientKind: 'user',
      recipientUserId: 'recipient',
      revokedAt: null,
      access: 'use',
    };
    f.tx.skillGrant.findMany.mockResolvedValue([grant] as never);
    const [useOnly] = await f.service.present(recipient, [imported]);
    expect(useOnly).toMatchObject({
      canUse: true,
      canRead: false,
      canFork: false,
      canExport: false,
      canShare: false,
      canPublish: false,
    });
    expect(useOnly.defaultInstructions).toBeUndefined();
    expect(
      (useOnly.config as Record<string, unknown>).defaultInstructions,
    ).toBeUndefined();
    f.tx.skillGrant.findMany.mockResolvedValue([
      { ...grant, access: 'use_and_read' },
    ] as never);
    f.tx.skillVersion.findMany.mockResolvedValue([
      {
        id: 'captured-import',
        skillId: 'new-import',
        instructionText: 'Granted immutable instructions',
        contentHash: 'captured-hash',
      },
    ]);
    const [readable] = await f.service.present(recipient, [
      {
        ...imported,
        defaultInstructions: 'Unshared live draft',
      } as SkillDocument,
    ]);
    expect(readable).toMatchObject({
      canRead: true,
      canFork: true,
      canExport: true,
      canEdit: false,
      canShare: false,
      canPublish: false,
      defaultInstructions: 'Granted immutable instructions',
    });
    const config = imported.config as Record<string, unknown>;
    const [unknown] = await f.service.present(recipient, [
      {
        ...imported,
        config: { ...config, importProvenance: undefined },
      } as unknown as SkillDocument,
    ]);
    expect(unknown).toMatchObject({
      canFork: false,
      canExport: false,
      canShare: false,
      canPublish: false,
    });
  });
  it('permits ordinary sharing but preserves public denial and paid/unknown provenance restrictions', async () => {
    const f = fixture();
    const imported = await f.service.importValidatedPackage(actor, input());
    const [ordinary] = await f.service.present(actor, [imported]);
    expect(ordinary).toMatchObject({
      canRead: true,
      canEdit: true,
      canShare: true,
      canPublish: false,
    });
    const config = imported.config as Record<string, unknown>;
    for (const changes of [
      { sourceListingId: 'skills-pro:paid' },
      { isBuiltIn: true },
      { importProvenance: undefined },
      {
        importProvenance: {
          format: 'genfeed.skill.ordinary-upload.v1',
          importedByUserId: 'somebody-else',
          packageChecksum: config.checksum,
        },
      },
      {
        importProvenance: {
          format: 'genfeed.skill.ordinary-upload.v1',
          importedByUserId: 'user-1',
          packageChecksum: '0'.repeat(64),
        },
      },
    ]) {
      const document = {
        ...imported,
        ...changes,
        config: { ...config, ...changes },
      } as unknown as SkillDocument;
      const [visible] = await f.service.present(actor, [document]);
      expect(visible).toMatchObject({ canShare: false, canPublish: false });
    }
  });
});

/** Independent versions-read fixtures: never share import/pin/receipt hooks above. */
describe('SkillLibraryService immutable versions read V1', () => {
  const actor = { userId: 'opaque|canonical', organizationId: 'org' };
  const checksum = 'a'.repeat(64);
  function captured(
    versionNumber: number,
    text = `edited ${versionNumber}`,
  ): SkillVersionSourceEvidenceV1 {
    const sourceField = text.length ? 'systemPromptTemplate' : null;
    return {
      id: `sv1_skill_${versionNumber}`,
      skillId: 'skill',
      versionNumber,
      format: 'genfeed.skill.legacy-snapshot.v1',
      payload: {
        format: 'genfeed.skill.legacy-snapshot.v1',
        instructions: { text, sourceField },
        instructionUsable: text.trim().length > 0,
        config: {
          source: 'imported',
          isBuiltIn: false,
          checksum,
          defaultInstructions: text,
          systemPromptTemplate: text,
          importProvenance: {
            format: 'genfeed.skill.ordinary-upload.v1',
            importedByUserId: actor.userId,
            packageChecksum: checksum,
          },
        },
      },
      instructionText: text,
      instructionSourceField: sourceField,
      instructionUsable: text.trim().length > 0,
      contentHash: `sha256:skill-v1:${'b'.repeat(64)}`,
      instructionHash: `sha256:skill-instruction-v1:${'c'.repeat(64)}`,
      createdById: actor.userId,
      createdAt: new Date('2026-10-02T14:00:00+02:00'),
    };
  }
  function fixture() {
    const parent = {
      id: 'skill',
      ownerKind: 'user',
      ownerUserId: actor.userId,
      organizationId: null as string | null,
      brandId: null as string | null,
      audience: 'private',
      isDeleted: false,
      isQuarantined: false,
      label: 'Mutable',
      revision: 4,
      currentVersionId: 'sv1_skill_3',
      publishedVersionId: null as string | null,
      sharedVersionId: null as string | null,
      config: { source: 'imported', isBuiltIn: false } as Record<
        string,
        unknown
      >,
    };
    const rows = [captured(1, 'original'), captured(2), captured(3)];
    const grants: Array<{
      skillId: string;
      skillVersionId: string;
      access: string;
      recipientKind: string;
      recipientUserId: string | null;
      recipientOrganizationId: string | null;
      recipientBrandId: string | null;
      revokedAt: Date | null;
    }> = [];
    const write = {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    };
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actor.userId }) },
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
      member: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'member', roleKey: 'member', brands: [] }),
      },
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
      skill: {
        ...write,
        findFirst: vi
          .fn()
          .mockImplementation(async () =>
            parent.isDeleted || parent.isQuarantined ? null : parent,
          ),
      },
      skillGrant: {
        ...write,
        findMany: vi.fn().mockImplementation(async () => grants),
      },
      skillAssignment: { ...write, findMany: vi.fn().mockResolvedValue([]) },
      skillVersion: {
        ...write,
        findFirst: vi
          .fn()
          .mockImplementation(
            async ({ where }: Prisma.SkillVersionFindFirstArgs) =>
              rows.find(
                (row) =>
                  row.skillId === where?.skillId &&
                  (where?.id === undefined || row.id === where.id) &&
                  (where?.versionNumber === undefined ||
                    row.versionNumber === where.versionNumber),
              ) ?? null,
          ),
        findMany: vi
          .fn()
          .mockImplementation(
            async ({ where, take }: Prisma.SkillVersionFindManyArgs) => {
              const idFilter = where?.id;
              const ids =
                typeof idFilter === 'object' &&
                idFilter !== null &&
                'in' in idFilter
                  ? idFilter.in
                  : undefined;
              const versionFilter = where?.versionNumber;
              const before =
                typeof versionFilter === 'object' &&
                versionFilter !== null &&
                'lt' in versionFilter
                  ? versionFilter.lt
                  : undefined;
              return rows
                .filter(
                  (row) =>
                    (where?.skillId === undefined ||
                      row.skillId === where.skillId) &&
                    (!Array.isArray(ids) || ids.includes(row.id)) &&
                    (typeof before !== 'number' || row.versionNumber < before),
                )
                .sort((a, b) => b.versionNumber - a.versionNumber)
                .slice(0, take ?? rows.length);
            },
          ),
      },
      skillResolutionReceipt: { ...write },
      $transaction: vi.fn(),
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
    };
    const service = new SkillLibraryService(prisma as unknown as PrismaService);
    const grant = (
      versionNumber: number,
      recipientKind = 'user',
      access = 'use_and_read',
    ) => {
      grants.push({
        skillId: 'skill',
        skillVersionId: `sv1_skill_${versionNumber}`,
        access,
        recipientKind,
        recipientUserId: 'reader',
        recipientOrganizationId: 'org',
        recipientBrandId: 'brand',
        revokedAt: null,
      });
    };
    return { service, prisma, parent, rows, grants, grant, write };
  }
  function immutableConfig(
    row: SkillVersionSourceEvidenceV1,
  ): Record<string, unknown> {
    return (row.payload as { config: Record<string, unknown> }).config;
  }
  const reader = { ...actor, userId: 'reader' };

  it('reads genesis/edited versions without using current config or original package as instruction checksum', async () => {
    const f = fixture();
    f.parent.config = { source: 'paid', importProvenance: 'untrusted mutable' };
    const page = await f.service.listVersions(actor, 'skill', {});
    expect(page).toEqual({
      items: [3, 2, 1].map((number) => ({
        id: `sv1_skill_${number}`,
        versionNumber: number,
        createdAt: '2026-10-02T12:00:00.000Z',
        contentHash: f.rows[number - 1].contentHash,
      })),
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
    expect(await f.service.getVersion(actor, 'skill', 'sv1_skill_2')).toEqual({
      ...page.items[1],
      instructionText: 'edited 2',
    });
    expect(f.prisma.skillAssignment.findMany).not.toHaveBeenCalled();
  });
  it('continues a limit1 page at the last returned row and never skips lookahead', async () => {
    const f = fixture();
    const page = await f.service.listVersions(actor, 'skill', { limit: 1 });
    expect(page).toMatchObject({
      items: [{ versionNumber: 3 }],
      limit: 1,
      hasMore: true,
      nextCursor: 3,
    });
    expect(f.prisma.skillVersion.findMany).toHaveBeenCalledWith({
      where: { skillId: 'skill' },
      orderBy: { versionNumber: 'desc' },
      take: 2,
    });
    const older = await f.service.listVersions(actor, 'skill', {
      limit: 1,
      beforeVersionNumber: page.nextCursor ?? undefined,
    });
    expect(older).toMatchObject({
      items: [{ versionNumber: 2 }],
      hasMore: true,
      nextCursor: 2,
    });
    expect(
      await f.service.listVersions(actor, 'skill', {
        limit: 1,
        beforeVersionNumber: 2,
      }),
    ).toMatchObject({
      items: [{ versionNumber: 1 }],
      hasMore: false,
      nextCursor: null,
    });
    expect(
      await f.service.listVersions(actor, 'skill', {
        limit: 50,
        beforeVersionNumber: 1,
      }),
    ).toEqual({ items: [], limit: 50, hasMore: false, nextCursor: null });
  });
  it('preserves exact whitespace and explicit empty bodies, stored hash namespaces and UTC timestamp', async () => {
    const f = fixture();
    for (const text of ['', ' \n\t ']) {
      f.rows[1] = captured(2, text);
      expect(await f.service.getVersion(actor, 'skill', 'sv1_skill_2')).toEqual(
        {
          id: 'sv1_skill_2',
          versionNumber: 2,
          instructionText: text,
          contentHash: f.rows[1].contentHash,
          createdAt: '2026-10-02T12:00:00.000Z',
        },
      );
    }
  });
  for (const source of [
    'custom',
    'customized',
    'paid',
    'unknown',
    'built_in',
  ]) {
    it(`denies governed ${source} history with no nongovernor fallback`, async () => {
      const f = fixture();
      immutableConfig(f.rows[0]).source = source;
      f.grant(2);
      await expect(f.service.listVersions(actor, 'skill', {})).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        f.service.getVersion(actor, 'skill', 'sv1_skill_2'),
      ).rejects.toThrow(NotFoundException);
      expect(f.prisma.skillAssignment.findMany).not.toHaveBeenCalled();
    });
  }
  const corruptions: Array<
    [string, (row: SkillVersionSourceEvidenceV1) => void]
  > = [
    [
      'missing provenance',
      (row) => {
        delete immutableConfig(row).importProvenance;
      },
    ],
    [
      'frontmatter/nested-config spoof',
      (row) => {
        const config = immutableConfig(row);
        config.configSchema = { importProvenance: config.importProvenance };
        delete config.importProvenance;
      },
    ],
    [
      'wrong importer',
      (row) => {
        (
          immutableConfig(row).importProvenance as Record<string, unknown>
        ).importedByUserId = 'foreign';
      },
    ],
    [
      'wrong package checksum',
      (row) => {
        (
          immutableConfig(row).importProvenance as Record<string, unknown>
        ).packageChecksum = 'd'.repeat(64);
      },
    ],
    [
      'different candidate package identity',
      (row) => {
        const config = immutableConfig(row);
        config.checksum = 'd'.repeat(64);
        (config.importProvenance as Record<string, unknown>).packageChecksum =
          config.checksum;
      },
    ],
    [
      'uppercase checksum',
      (row) => {
        immutableConfig(row).checksum = 'A'.repeat(64);
      },
    ],
    [
      'protected listing',
      (row) => {
        immutableConfig(row).sourceListingId = 'paid-listing';
      },
    ],
    [
      'built-in flag',
      (row) => {
        immutableConfig(row).isBuiltIn = true;
      },
    ],
    [
      'wrong attribution',
      (row) => {
        row.createdById = 'foreign';
      },
    ],
    [
      'missing attribution',
      (row) => {
        row.createdById = null;
      },
    ],
    [
      'foreign same-looking skill',
      (row) => {
        row.skillId = 'foreign';
      },
    ],
    [
      'wrong captured id',
      (row) => {
        row.id = 'sv1_foreign_2';
      },
    ],
    [
      'unsupported format',
      (row) => {
        row.format = 'unknown';
      },
    ],
    [
      'malformed payload',
      (row) => {
        row.payload = [];
      },
    ],
    [
      'malformed config',
      (row) => {
        (row.payload as Record<string, unknown>).config = null;
      },
    ],
    [
      'inconsistent instruction',
      (row) => {
        row.instructionText = 'contradiction';
      },
    ],
    [
      'inconsistent source field',
      (row) => {
        row.instructionSourceField = 'defaultInstructions';
      },
    ],
    [
      'inconsistent usability',
      (row) => {
        row.instructionUsable = false;
      },
    ],
    [
      'malformed content hash',
      (row) => {
        row.contentHash = 'unqualified';
      },
    ],
    [
      'malformed instruction hash',
      (row) => {
        row.instructionHash = 'unqualified';
      },
    ],
    [
      'malformed timestamp',
      (row) => {
        row.createdAt = new Date(NaN);
      },
    ],
  ];
  for (const [name, corrupt] of corruptions) {
    it(`fails closed on candidate ${name} without silently skipping or scanning`, async () => {
      const f = fixture();
      corrupt(f.rows[1]);
      if (f.rows[1].skillId !== 'skill')
        f.prisma.skillVersion.findMany.mockResolvedValueOnce([f.rows[1]]);
      await expect(
        f.service.listVersions(actor, 'skill', {
          limit: 1,
          beforeVersionNumber: 3,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        f.service.getVersion(actor, 'skill', 'sv1_skill_2'),
      ).rejects.toThrow(NotFoundException);
      expect(f.prisma.skillVersion.findMany).toHaveBeenCalledTimes(1);
    });
  }
  it('accepts metadata-only edits retaining immutable package identity', async () => {
    const f = fixture();
    const config = immutableConfig(f.rows[1]);
    config.name = 'new historical metadata';
    config.description = 'changed description';
    expect(
      (await f.service.getVersion(actor, 'skill', 'sv1_skill_2'))
        .instructionText,
    ).toBe('edited 2');
  });
  it('denies inconsistent personal ownership and organization governors without read fallback', async () => {
    for (const ownerKind of ['user', 'organization', 'brand']) {
      const f = fixture();
      f.parent.ownerKind = ownerKind;
      f.parent.organizationId = 'org';
      if (ownerKind === 'brand') f.parent.brandId = 'brand';
      f.prisma.member.findFirst.mockResolvedValue({
        roleKey: 'admin',
        brands: [],
      });
      await expect(f.service.listVersions(actor, 'skill', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(f.prisma.skillAssignment.findMany).not.toHaveBeenCalled();
    }
  });
  it('validates malformed lookahead evidence instead of advertising its history', async () => {
    const f = fixture();
    immutableConfig(f.rows[1]).importProvenance = null;
    await expect(
      f.service.listVersions(actor, 'skill', { limit: 1 }),
    ).rejects.toThrow(NotFoundException);
  });
  it('requires actual same-skill genesis1 and rejects mutable config certificates', async () => {
    const f = fixture();
    f.parent.config = immutableConfig(f.rows[0]);
    f.rows[0].payload = { config: { source: 'custom' } };
    await expect(f.service.listVersions(actor, 'skill', {})).rejects.toThrow(
      NotFoundException,
    );
    f.rows.shift();
    await expect(
      f.service.getVersion(actor, 'skill', 'sv1_skill_2'),
    ).rejects.toThrow(NotFoundException);
  });
  it('uses the actual ranked read loader singleton, never use-only/assignments/current draft/grant union', async () => {
    const f = fixture();
    f.grant(3, 'user', 'use');
    f.grant(1, 'organization');
    f.grant(2, 'user');
    f.grant(3, 'brand');
    f.prisma.skillAssignment.findMany.mockResolvedValue([
      {
        skillId: 'skill',
        skillVersionId: 'sv1_skill_3',
        targetKind: 'user',
        userId: 'reader',
      },
    ]);
    expect(await f.service.listVersions(reader, 'skill', {})).toMatchObject({
      items: [{ id: 'sv1_skill_2' }],
      hasMore: false,
      nextCursor: null,
    });
    expect(f.prisma.skillAssignment.findMany).toHaveBeenCalled();
    expect(f.prisma.skillVersion.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['sv1_skill_2'] } },
    });
    await expect(
      f.service.getVersion(reader, 'skill', 'sv1_skill_1'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      f.service.getVersion(reader, 'skill', 'sv1_skill_3'),
    ).rejects.toThrow(NotFoundException);
    expect(
      await f.service.listVersions(reader, 'skill', { beforeVersionNumber: 2 }),
    ).toEqual({ items: [], limit: 20, hasMore: false, nextCursor: null });
  });
  it('retains organization and authenticated-brand read precedence with no inferred brand', async () => {
    const f = fixture();
    f.grant(1, 'organization');
    f.grant(2, 'brand');
    expect(
      (await f.service.listVersions(reader, 'skill', {})).items[0].id,
    ).toBe('sv1_skill_1');
    f.prisma.member.findFirst.mockResolvedValue({
      id: 'member',
      roleKey: 'member',
      brands: [{ id: 'brand' }],
    });
    expect(
      (
        await f.service.listVersions(
          { ...reader, brandId: 'brand' },
          'skill',
          {},
        )
      ).items[0].id,
    ).toBe('sv1_skill_2');
  });
  for (const denied of [
    'use-only',
    'revoked',
    'wrong-user',
    'wrong-org',
    'brand-without-context',
    'loader-missing-row',
  ]) {
    it(`denies nongovernor ${denied} even when cursor would exclude the snapshot`, async () => {
      const f = fixture();
      f.grant(2);
      if (denied === 'use-only') f.grants[0].access = 'use';
      if (denied === 'revoked') f.grants[0].revokedAt = new Date();
      if (denied === 'wrong-user') f.grants[0].recipientUserId = 'foreign';
      if (denied === 'wrong-org') {
        f.grants[0].recipientKind = 'organization';
        f.grants[0].recipientOrganizationId = 'foreign';
      }
      if (denied === 'brand-without-context')
        f.grants[0].recipientKind = 'brand';
      if (denied === 'loader-missing-row') f.rows.splice(1, 1);
      await expect(
        f.service.listVersions(reader, 'skill', { beforeVersionNumber: 1 }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        f.service.getVersion(reader, 'skill', 'sv1_skill_2'),
      ).rejects.toThrow(NotFoundException);
    });
  }
  for (const pointer of ['public', 'shared', 'catalog']) {
    it(`reads existing ${pointer} pinned body with newer draft present and no extra history`, async () => {
      const f = fixture();
      if (pointer === 'public') {
        f.parent.audience = 'public';
        f.parent.publishedVersionId = 'sv1_skill_1';
      }
      if (pointer === 'shared') {
        f.parent.ownerKind = 'organization';
        f.parent.organizationId = 'org';
        f.parent.audience = 'organization';
        f.parent.sharedVersionId = 'sv1_skill_1';
      }
      if (pointer === 'catalog') {
        f.parent.ownerKind = 'system';
        f.parent.config = { source: 'built_in', isBuiltIn: true };
        f.parent.currentVersionId = 'sv1_skill_1';
      }
      if (pointer === 'public') f.parent.config = immutableConfig(f.rows[0]);
      expect(
        (await f.service.listVersions(reader, 'skill', {})).items,
      ).toHaveLength(1);
      expect(
        (await f.service.getVersion(reader, 'skill', 'sv1_skill_1'))
          .instructionText,
      ).toBe('original');
      await expect(
        f.service.getVersion(reader, 'skill', 'sv1_skill_3'),
      ).rejects.toThrow(NotFoundException);
    });
  }
  for (const scope of [
    'user',
    'organization',
    'member',
    'brand',
    'brand-access',
    'deleted-parent',
    'quarantined-parent',
    'missing-parent',
  ]) {
    it(`reauthorizes live ${scope} on every list/read with uniform404`, async () => {
      const f = fixture();
      if (scope === 'user') f.prisma.user.findFirst.mockResolvedValue(null);
      if (scope === 'organization')
        f.prisma.organization.findFirst.mockResolvedValue(null);
      if (scope === 'member') f.prisma.member.findFirst.mockResolvedValue(null);
      if (scope === 'brand') f.prisma.brand.findFirst.mockResolvedValue(null);
      if (scope === 'deleted-parent') f.parent.isDeleted = true;
      if (scope === 'quarantined-parent') f.parent.isQuarantined = true;
      if (scope === 'missing-parent')
        f.prisma.skill.findFirst.mockResolvedValue(null);
      const scoped = scope.startsWith('brand')
        ? { ...actor, brandId: 'brand' }
        : actor;
      await expect(
        f.service.listVersions(scoped, 'skill', {}),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        f.service.getVersion(scoped, 'skill', 'sv1_skill_2'),
      ).rejects.toMatchObject({ status: 404 });
      expect(f.prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: actor.userId, isDeleted: false },
        select: { id: true },
      });
      expect(f.prisma.member.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: actor.userId,
            organizationId: 'org',
            isDeleted: false,
            isActive: true,
          },
        }),
      );
    });
  }
  it('rejects foreign IDs, malformed limits and no-read callers with the canonical error shape', async () => {
    const f = fixture();
    await expect(
      f.service.getVersion(actor, 'skill', 'sv1_foreign_2'),
    ).rejects.toMatchObject({
      response: {
        detail: 'Skill version not found',
        title: 'Resource Not Found',
      },
    });
    await expect(
      f.service.listVersions(actor, 'skill', { limit: 51 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      f.service.listVersions(reader, 'skill', {}),
    ).rejects.toMatchObject({
      response: {
        detail: 'Skill version not found',
        title: 'Resource Not Found',
      },
    });
  });
  it('reauthorizes successive pointer/grant/scope requests and performs no writes/capture/provider operations', async () => {
    const f = fixture();
    f.grant(2);
    await f.service.listVersions(reader, 'skill', {});
    await f.service.getVersion(reader, 'skill', 'sv1_skill_2');
    f.grants[0].revokedAt = new Date();
    await expect(
      f.service.getVersion(reader, 'skill', 'sv1_skill_2'),
    ).rejects.toThrow(NotFoundException);
    for (const spy of Object.values(f.write))
      expect(spy).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
