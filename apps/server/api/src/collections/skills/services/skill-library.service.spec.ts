import { BUILT_IN_SKILL_CATALOG } from '@api/collections/skills/constants/skill-validation.constant';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { parseSkillPackageManifest } from '@api/collections/skills/utils/skill-package-manifest.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
