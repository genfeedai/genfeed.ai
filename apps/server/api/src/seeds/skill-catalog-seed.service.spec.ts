import type { FirstPartySkillDefinition } from '@api/collections/skills/catalog/first-party-skill.types';
import { ORIGINAL_BUILT_IN_SKILL_CATALOG } from '@api/collections/skills/constants/skill-catalog-identity';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillCatalogSeedService } from './skill-catalog-seed.service';

const imagePrompt: FirstPartySkillDefinition = {
  category: 'image',
  channels: [],
  description: 'Craft image prompts',
  id: 'cskillbuiltinimagepromptengineer',
  instructions: '# Image Prompt Engineer\n\nYou are an expert.',
  modalities: ['image'],
  name: 'Image Prompt Engineer',
  slug: 'image-prompt-engineer',
  version: '1.0.0',
  workflowStage: 'creation',
};

const geo: FirstPartySkillDefinition = {
  category: 'optimization',
  channels: ['blog'],
  description: 'GEO optimizer',
  id: ORIGINAL_BUILT_IN_SKILL_CATALOG[0].id,
  instructions: '# Content GEO Optimizer\n\nOptimize for answer engines.',
  modalities: ['text'],
  name: 'Content GEO Optimizer',
  slug: ORIGINAL_BUILT_IN_SKILL_CATALOG[0].slug,
  version: '1.0.0',
  workflowStage: 'review',
};

describe('SkillCatalogSeedService', () => {
  let prisma: {
    skill: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let service: SkillCatalogSeedService;

  beforeEach(() => {
    prisma = {
      skill: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    service = new SkillCatalogSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  it('inserts missing first-party catalog rows with the compact identity', async () => {
    const result = await service.reconcileCatalog([imagePrompt]);

    expect(result).toEqual({ inserted: 1, skipped: 0, updated: 0 });
    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          defaultInstructions: imagePrompt.instructions,
          isBuiltIn: true,
          slug: 'image-prompt-engineer',
          source: 'built_in',
          systemPromptTemplate: imagePrompt.instructions,
          version: '1.0.0',
        }),
        id: 'cskillbuiltinimagepromptengineer',
        organizationId: null,
      }),
    });
  });

  it('updates SKILL.md instructions when the trusted global row version changes', async () => {
    prisma.skill.findUnique.mockResolvedValue({
      config: {
        defaultInstructions: 'old stub',
        isBuiltIn: true,
        slug: geo.slug,
        source: 'built_in',
        systemPromptTemplate: 'old stub',
        version: '0.9.0',
      },
      id: geo.id,
      isDeleted: false,
      organizationId: null,
    });

    const result = await service.reconcileCatalog([geo]);

    expect(result).toEqual({ inserted: 0, skipped: 0, updated: 1 });
    expect(prisma.skill.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          defaultInstructions: geo.instructions,
          version: '1.0.0',
        }),
        organizationId: null,
      }),
      where: { id: geo.id },
    });
  });

  it('does not overwrite an organization-owned fork of a catalog id', async () => {
    prisma.skill.findUnique.mockResolvedValue({
      config: { slug: imagePrompt.slug, source: 'customized' },
      id: imagePrompt.id,
      organizationId: 'org-1',
    });

    const result = await service.reconcileCatalog([imagePrompt]);

    expect(result).toEqual({ inserted: 0, skipped: 1, updated: 0 });
    expect(prisma.skill.create).not.toHaveBeenCalled();
    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('is idempotent when catalog content is unchanged', async () => {
    prisma.skill.findUnique.mockResolvedValue({
      config: {
        defaultInstructions: imagePrompt.instructions,
        description: imagePrompt.description,
        isBuiltIn: true,
        name: imagePrompt.name,
        slug: imagePrompt.slug,
        source: 'built_in',
        systemPromptTemplate: imagePrompt.instructions,
        version: imagePrompt.version,
      },
      id: imagePrompt.id,
      isDeleted: false,
      organizationId: null,
    });

    const first = await service.reconcileCatalog([imagePrompt]);
    const second = await service.reconcileCatalog([imagePrompt]);

    expect(first).toEqual({ inserted: 0, skipped: 1, updated: 0 });
    expect(second).toEqual({ inserted: 0, skipped: 1, updated: 0 });
    expect(prisma.skill.create).not.toHaveBeenCalled();
    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('preserves original five identities when seeding content-geo-optimizer', async () => {
    await service.reconcileCatalog([geo]);

    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'cskillbuiltincontentgeo',
        config: expect.objectContaining({
          slug: 'content-geo-optimizer',
        }),
      }),
    });
  });
});
