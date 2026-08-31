import { LoggerService } from '@libs/logger/logger.service';
import { BUILT_IN_SKILL_CATALOG } from '@server/collections/skills/constants/skill-validation.constant';
import { SkillsService } from '@server/collections/skills/services/skills.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { ValidationException } from '@server/exceptions/validation.exception';
import { ByokProviderFactoryService } from '@server/services/byok/byok-provider-factory.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SkillRow = {
  config: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  label: string;
  organizationId: string | null;
};

function makeSkillRow(overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    config: {
      isEnabled: true,
      name: 'Hook Writer',
      slug: 'hook-writer',
      source: 'custom',
      status: 'published',
    },
    id: 'skill-1',
    isDeleted: false,
    label: 'Hook Writer',
    organizationId: 'org-1',
    ...overrides,
  };
}

describe('SkillsService', () => {
  const prisma = {
    brand: {
      findFirst: vi.fn(),
    },
    skill: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  };
  const byokProviderFactoryService = { hasProviderAccess: vi.fn() };
  const loggerService = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };

  const skillPayload = {
    category: 'copywriting' as never,
    channels: ['youtube'] as ['youtube'],
    description: 'Writes hooks',
    modalities: ['text'] as ['text'],
    name: 'Hook Writer',
    slug: 'hook-writer',
    workflowStage: 'creation' as const,
  };

  let service: SkillsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { enabledSkills: [] },
      id: 'brand-1',
    });
    prisma.skill.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...makeSkillRow(),
        ...data,
        config: data.config,
      }),
    );
    prisma.skill.findMany.mockResolvedValue([]);
    prisma.skill.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...makeSkillRow(), config: data.config }),
    );
    service = new SkillsService(
      prisma as unknown as PrismaService,
      byokProviderFactoryService as unknown as ByokProviderFactoryService,
      loggerService as unknown as LoggerService,
    );
  });

  it.each([
    ['create', () => service.createSkill(undefined as never, skillPayload)],
    ['import', () => service.importSkill(undefined as never, skillPayload)],
    [
      'managed install',
      () =>
        service.installManagedSkillPackage(undefined as never, {
          ...skillPayload,
          checksum: 'abc',
          files: [],
          instructions: 'Private instructions',
          version: '1.0.0',
        }),
    ],
    [
      'customize',
      () => service.customizeSkill(undefined as never, 'skill-1', {}),
    ],
    [
      'update',
      () =>
        service.updateSkill(undefined as never, 'skill-1', {
          name: 'Renamed',
        }),
    ],
    ['list', () => service.listAllForOrg(undefined as never)],
    ['available list', () => service.getAvailableForOrg(undefined as never)],
    ['single read', () => service.getSkillById(undefined as never, 'skill-1')],
    [
      'brand assertion',
      () =>
        service.assertBrandSkillEnabled(
          undefined as never,
          'brand-1',
          'hook-writer',
        ),
    ],
    [
      'enabled slugs read',
      () => service.getEnabledSkillSlugs(undefined as never, 'brand-1'),
    ],
    [
      'brand resolution',
      () => service.resolveBrandSkills(undefined as never, 'brand-1'),
    ],
  ])(
    'rejects %s without organization context before data access',
    async (_operation, invoke) => {
      await expect(
        Promise.resolve().then(() => invoke() as unknown as Promise<void>),
      ).rejects.toBeInstanceOf(ValidationException);

      expect(prisma.brand.findFirst).not.toHaveBeenCalled();
      expect(prisma.skill.create).not.toHaveBeenCalled();
      expect(prisma.skill.findFirst).not.toHaveBeenCalled();
      expect(prisma.skill.findMany).not.toHaveBeenCalled();
      expect(prisma.skill.update).not.toHaveBeenCalled();
      expect(
        byokProviderFactoryService.hasProviderAccess,
      ).not.toHaveBeenCalled();
    },
  );

  it('creates an enabled organization-owned custom skill', async () => {
    await service.createSkill('org-1', skillPayload);

    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          isBuiltIn: false,
          isEnabled: true,
          source: 'custom',
          status: 'published',
        }),
        isDeleted: false,
        organizationId: 'org-1',
      }),
    });
  });

  it('installs a managed pack into the organization runtime store', async () => {
    prisma.skill.findFirst.mockResolvedValue(null);

    await service.installManagedSkillPackage('org-1', {
      ...skillPayload,
      checksum: 'a'.repeat(64),
      files: [{ content: 'Private instructions', path: 'SKILL.md' }],
      instructions: 'Private instructions',
      version: '1.0.0',
    });

    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          integrity: {
            algorithm: 'sha256',
            checksum: 'a'.repeat(64),
          },
          isBuiltIn: false,
          isEnabled: true,
          source: 'imported',
          sourceListingId: 'skills-pro:hook-writer',
          status: 'published',
          systemPromptTemplate: 'Private instructions',
        }),
        organizationId: 'org-1',
      }),
    });
  });

  it('imports a skill as an enabled organization-owned draft', async () => {
    await service.importSkill('org-1', skillPayload);

    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          isBuiltIn: false,
          isEnabled: true,
          source: 'imported',
          status: 'draft',
        }),
        organizationId: 'org-1',
      }),
    });
  });

  it('creates a disabled skill with execution disabled', async () => {
    await service.createSkill('org-1', {
      ...skillPayload,
      status: 'disabled',
    });

    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          isEnabled: false,
          status: 'disabled',
        }),
      }),
    });
  });

  it('rejects a client request to create a built-in skill', async () => {
    await expect(
      service.createSkill('org-1', { ...skillPayload, isBuiltIn: true }),
    ).rejects.toBeInstanceOf(ValidationException);

    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('rejects the built-in source even when isBuiltIn is false', async () => {
    await expect(
      service.createSkill('org-1', {
        ...skillPayload,
        isBuiltIn: false,
        source: 'built_in',
      }),
    ).rejects.toBeInstanceOf(ValidationException);

    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('rejects client-created customized provenance without a fork', async () => {
    await expect(
      service.createSkill('org-1', {
        ...skillPayload,
        source: 'customized',
      }),
    ).rejects.toBeInstanceOf(ValidationException);

    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('reserves executable built-in slugs from organization-owned creation', async () => {
    await expect(
      service.createSkill('org-1', {
        ...skillPayload,
        slug: 'content-writing',
      }),
    ).rejects.toBeInstanceOf(ValidationException);

    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('reserves first-party SKILL.md slugs from organization-owned creation', async () => {
    await expect(
      service.createSkill('org-1', {
        ...skillPayload,
        slug: 'image-prompt-engineer',
      }),
    ).rejects.toBeInstanceOf(ValidationException);

    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('reserves executable built-in slugs from customization', async () => {
    prisma.skill.findFirst.mockResolvedValue(makeSkillRow());

    await expect(
      service.customizeSkill('org-1', 'skill-1', {
        slug: 'content-writing',
      }),
    ).rejects.toBeInstanceOf(ValidationException);

    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('validates enabled slugs against built-in and organization skills', async () => {
    const builtIn = BUILT_IN_SKILL_CATALOG[1];
    prisma.skill.findMany.mockResolvedValue([
      makeSkillRow({
        config: {
          isBuiltIn: true,
          isEnabled: true,
          slug: builtIn.slug,
          source: 'built_in',
          status: 'published',
        },
        id: builtIn.id,
        organizationId: null,
      }),
      makeSkillRow({
        config: { slug: 'org-skill' },
        id: 'skill-2',
      }),
    ]);

    await expect(
      service.assertAccessibleSkillSlugs('org-1', [builtIn.slug, 'org-skill']),
    ).resolves.toBeUndefined();

    expect(prisma.skill.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { isDeleted: false },
          {
            OR: [
              { organizationId: 'org-1' },
              {
                AND: [
                  { organizationId: null },
                  { config: { equals: true, path: ['isBuiltIn'] } },
                  { config: { equals: 'built_in', path: ['source'] } },
                  {
                    OR: BUILT_IN_SKILL_CATALOG.map(({ id, slug }) => ({
                      AND: [
                        { id },
                        { config: { equals: slug, path: ['slug'] } },
                      ],
                    })),
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it('does not trust a null-owned custom row as a global catalog skill', async () => {
    prisma.skill.findMany.mockResolvedValue([
      makeSkillRow({ organizationId: null }),
    ]);

    await expect(
      service.assertAccessibleSkillSlugs('org-1', ['hook-writer']),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it.each([null, [''], ['duplicate', 'duplicate']])(
    'rejects malformed enabled skill slugs at the service boundary: %j',
    async (skillSlugs) => {
      await expect(
        service.assertAccessibleSkillSlugs('org-1', skillSlugs as never),
      ).rejects.toBeInstanceOf(ValidationException);

      expect(prisma.skill.findMany).not.toHaveBeenCalled();
    },
  );

  it('accepts an empty enabled-skill list without querying', async () => {
    await expect(
      service.assertAccessibleSkillSlugs('org-1', []),
    ).resolves.toBeUndefined();

    expect(prisma.skill.findMany).not.toHaveBeenCalled();
  });

  it('rejects a missing, deleted, or foreign enabled skill slug', async () => {
    prisma.skill.findMany.mockResolvedValue([makeSkillRow()]);

    await expect(
      service.assertAccessibleSkillSlugs('org-1', ['foreign-skill']),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it('keeps an empty brand enabledSkills list empty for settings toggles', async () => {
    await expect(
      service.getEnabledSkillSlugs('org-1', 'brand-1'),
    ).resolves.toEqual([]);
  });

  it('filters malformed and inaccessible stored enabled-skill slugs', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: {
        enabledSkills: ['hook-writer', 'foreign-skill', '', 42],
      },
      id: 'brand-1',
    });
    prisma.skill.findMany.mockResolvedValue([makeSkillRow()]);

    await expect(
      service.getEnabledSkillSlugs('org-1', 'brand-1'),
    ).resolves.toEqual(['hook-writer']);

    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
  });

  it.each([
    { isEnabled: false, status: 'published' },
    { isEnabled: undefined, status: 'published' },
    { isEnabled: true, status: 'disabled' },
  ])('filters non-executable stored skill state: %j', async (state) => {
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { enabledSkills: ['hook-writer'] },
      id: 'brand-1',
    });
    prisma.skill.findMany.mockResolvedValue([
      makeSkillRow({ config: { slug: 'hook-writer', ...state } }),
    ]);

    await expect(
      service.getEnabledSkillSlugs('org-1', 'brand-1'),
    ).resolves.toEqual([]);
  });

  it('resolves a reserved slug through its canonical catalog id', async () => {
    const builtIn = BUILT_IN_SKILL_CATALOG[1];
    prisma.skill.findFirst.mockResolvedValue(
      makeSkillRow({
        config: {
          isBuiltIn: true,
          isEnabled: true,
          slug: builtIn.slug,
          source: 'built_in',
          status: 'published',
        },
        id: builtIn.id,
        organizationId: null,
      }),
    );

    await expect(
      service.getSkillById('org-1', builtIn.slug),
    ).resolves.toMatchObject({ id: builtIn.id, slug: builtIn.slug });

    expect(prisma.skill.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: builtIn.id }),
    });
    expect(prisma.skill.findMany).not.toHaveBeenCalled();
  });

  it('updates a skill the organization owns', async () => {
    prisma.skill.findFirst.mockResolvedValue(makeSkillRow());

    const updated = await service.updateSkill('org-1', 'skill-1', {
      name: 'Hook Writer v2',
    });

    expect(prisma.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'skill-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
    expect(updated.name).toBe('Hook Writer v2');
  });

  it('keeps execution state aligned when a skill status changes', async () => {
    prisma.skill.findFirst.mockResolvedValue(makeSkillRow());

    await service.updateSkill('org-1', 'skill-1', {
      status: 'disabled',
    });

    expect(prisma.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            isEnabled: false,
            status: 'disabled',
          }),
        }),
      }),
    );
  });

  it('rejects a null status before mutating an existing skill', async () => {
    await expect(
      service.updateSkill('org-1', 'skill-1', {
        status: null,
      } as never),
    ).rejects.toBeInstanceOf(ValidationException);

    expect(prisma.skill.findFirst).not.toHaveBeenCalled();
    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('rejects a catalog-global skill instead of attempting the write', async () => {
    // `getSkillById` resolves through `buildAccessibleSkillWhere`, which also
    // returns global rows (`organizationId: null`). The organization-scoped
    // update can never match one, so the request must be rejected as
    // not-found rather than reaching the database and failing there.
    prisma.skill.findFirst.mockResolvedValue(
      makeSkillRow({ id: 'skill-global', organizationId: null }),
    );

    await expect(
      service.updateSkill('org-1', 'skill-global', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('rejects a skill owned by another organization', async () => {
    prisma.skill.findFirst.mockResolvedValue(
      makeSkillRow({ id: 'skill-foreign', organizationId: 'org-2' }),
    );

    await expect(
      service.updateSkill('org-1', 'skill-foreign', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('rejects an unresolvable skill id', async () => {
    prisma.skill.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSkill('org-1', 'missing', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('marks customized forks as customized provenance', async () => {
    prisma.skill.findFirst.mockResolvedValue(
      makeSkillRow({
        config: {
          defaultInstructions: 'Base',
          isBuiltIn: true,
          name: 'Image Prompt Engineer',
          slug: 'image-prompt-engineer',
          source: 'built_in',
        },
        id: 'cskillbuiltinimagepromptengineer',
        organizationId: null,
      }),
    );

    await service.customizeSkill('org-1', 'image-prompt-engineer', {
      name: 'Image Prompt Engineer Custom',
    });

    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          isBuiltIn: false,
          source: 'customized',
        }),
        organizationId: 'org-1',
      }),
    });
  });

  it('injects the modality default catalog when enabledSkills is empty', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { enabledSkills: [] },
      id: 'brand-1',
    });
    prisma.skill.findMany.mockResolvedValue([
      makeSkillRow({
        config: {
          isBuiltIn: true,
          isEnabled: true,
          modalities: ['image'],
          name: 'Image Prompt Engineer',
          slug: 'image-prompt-engineer',
          source: 'built_in',
          status: 'published',
        },
        id: 'cskillbuiltinimagepromptengineer',
        organizationId: null,
      }),
      makeSkillRow({
        config: {
          isBuiltIn: true,
          isEnabled: true,
          modalities: ['image', 'video', 'audio'],
          name: 'Model Selector',
          slug: 'model-selector',
          source: 'built_in',
          status: 'published',
        },
        id: 'cskillbuiltinmodelselector',
        organizationId: null,
      }),
    ]);
    byokProviderFactoryService.hasProviderAccess.mockResolvedValue(true);

    const resolved = await service.resolveBrandSkills('org-1', 'brand-1', {
      fallbackToDefaultCatalog: true,
      modality: 'image',
    });

    expect(resolved.map((entry) => entry.skill.slug)).toEqual([
      'image-prompt-engineer',
      'model-selector',
    ]);
  });

  it('does not leak a foreign-org skill through catalog fallback', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { enabledSkills: [] },
      id: 'brand-1',
    });
    prisma.skill.findMany.mockResolvedValue([
      makeSkillRow({
        config: { slug: 'secret-skill', source: 'custom' },
        id: 'skill-foreign',
        organizationId: 'org-2',
      }),
    ]);

    await expect(
      service.resolveBrandSkills('org-1', 'brand-1', {
        fallbackToDefaultCatalog: true,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects a slug-resolved skill that belongs to another organization', async () => {
    // The slug fallback scans the accessible set in memory, so it can surface
    // a row the scoped write could never touch.
    prisma.skill.findFirst.mockResolvedValue(null);
    prisma.skill.findMany.mockResolvedValue([
      makeSkillRow({ id: 'skill-foreign', organizationId: 'org-2' }),
    ]);

    await expect(
      service.updateSkill('org-1', 'hook-writer', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });
});
