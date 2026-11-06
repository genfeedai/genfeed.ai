import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import type { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { SkillsService } from '@api/collections/skills/services/skills.service';
import type { WorkflowSchedulePrincipal } from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';

interface StoredBrand {
  agentConfig: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  label: string;
  organizationId: string;
  scheduleActor?: WorkflowSchedulePrincipal;
  slug: string;
}

const ORG = 'org-1';
const BRAND = 'brand-1';

const request = {
  originalUrl: `/v1/brands/${BRAND}/agent-config`,
} as Request;
const user = {
  id: 'user-1',
  organizationId: ORG,
  userId: 'user-1',
} as unknown as User;
const orgless = { ...user, organizationId: undefined } as unknown as User;

const validDto: UpdateBrandAgentConfigDto = {
  autoPublish: { enabled: true },
  enabledSkills: ['content-writing'],
  schedule: { enabled: false },
  strategy: {
    contentTypes: ['thread'],
    frequency: 'daily',
    goals: ['engagement'],
    platforms: ['twitter'],
  },
  voice: {
    audience: ['founders'],
    style: 'direct',
    tone: 'confident',
    values: ['clarity'],
  },
};

describe('BrandsAgentConfigController', () => {
  let brands: StoredBrand[];
  let controller: BrandsAgentConfigController;

  const brand = (id = BRAND) => brands.find((row) => row.id === id);

  beforeEach(() => {
    brands = [
      {
        agentConfig: { defaultModel: 'gpt-4o', enabledSkills: ['seo'] },
        id: BRAND,
        isDeleted: false,
        label: 'Test Brand',
        organizationId: ORG,
        slug: 'test-handle',
      },
      {
        agentConfig: {},
        id: 'foreign-brand',
        isDeleted: false,
        label: 'Foreign',
        organizationId: 'org-2',
        slug: 'foreign',
      },
    ];

    // The brand store merges an agent-config patch into the org's brand.
    const brandsService = {
      updateAgentConfig: async (
        id: string,
        organizationId: string,
        patch: UpdateBrandAgentConfigDto,
        principal?: WorkflowSchedulePrincipal,
      ) => {
        const row = brands.find(
          (candidate) =>
            candidate.id === id &&
            candidate.organizationId === organizationId &&
            !candidate.isDeleted,
        );
        if (!row) return null;
        Object.assign(row.agentConfig, JSON.parse(JSON.stringify(patch)));
        row.scheduleActor = principal;
        return { ...row };
      },
    };
    // Org 1 owns a skill catalog and one avatar image.
    const skillsService = {
      assertAccessibleSkillSlugs: async (
        organizationId: string,
        slugs: string[],
      ) => {
        const catalog =
          organizationId === ORG ? ['content-writing', 'seo'] : [];
        const unknown = slugs.filter((slug) => !catalog.includes(slug));
        if (unknown.length > 0) {
          throw new BadRequestException(`Unknown skill: ${unknown.join(', ')}`);
        }
      },
    };
    const ingredientsService = {
      findAvatarImageById: async (id: string, organizationId: string) =>
        id === 'avatar-1' && organizationId === ORG ? { id } : null,
    };

    controller = new BrandsAgentConfigController(
      brandsService as unknown as BrandsService,
      ingredientsService as unknown as IngredientsService,
      skillsService as unknown as SkillsService,
    );
  });

  describe('updateAgentConfig', () => {
    it('saves the config and binds the saving principal as schedule actor (#6682)', async () => {
      const response = await controller.updateAgentConfig(
        request,
        user,
        BRAND,
        validDto,
      );

      expect(response.data).toMatchObject({
        attributes: expect.objectContaining({ label: 'Test Brand' }),
        id: BRAND,
        type: 'brand',
      });
      expect(brand()).toMatchObject({
        agentConfig: { defaultModel: 'gpt-4o', ...validDto },
        scheduleActor: {
          isApiKey: false,
          organizationId: ORG,
          scopes: [],
          userId: 'user-1',
        },
      });
    });

    it('keeps the saved skills when a patch omits them', async () => {
      await controller.updateAgentConfig(request, user, BRAND, {
        defaultModel: 'gpt-5',
      });

      expect(brand()?.agentConfig).toEqual({
        defaultModel: 'gpt-5',
        enabledSkills: ['seo'],
      });
    });

    it.each([
      [
        'a skill outside the organization catalog',
        { enabledSkills: ['foreign-skill'] },
        'Unknown skill: foreign-skill',
      ],
      [
        'an avatar outside the organization',
        { defaultAvatarIngredientId: 'bad-avatar' },
        'Default avatar must reference an avatar image ingredient in this organization',
      ],
    ])('refuses %s without saving', async (_case, patch, message) => {
      await expect(
        controller.updateAgentConfig(request, user, BRAND, patch),
      ).rejects.toThrow(message);
      expect(brand()?.agentConfig).toEqual({
        defaultModel: 'gpt-4o',
        enabledSkills: ['seo'],
      });
    });

    it('saves an organization avatar as the default', async () => {
      await controller.updateAgentConfig(request, user, BRAND, {
        defaultAvatarIngredientId: 'avatar-1',
      });

      expect(brand()?.agentConfig.defaultAvatarIngredientId).toBe('avatar-1');
    });

    it.each([
      ['a brand of another organization', 'foreign-brand'],
      ['an unknown brand', 'missing'],
    ])('answers not found for %s', async (_case, id) => {
      await expect(
        controller.updateAgentConfig(request, user, id, validDto),
      ).rejects.toMatchObject({
        response: { detail: 'Brand not found', title: 'Not Found' },
        status: 404,
      });
      expect(brand('foreign-brand')?.agentConfig).toEqual({});
    });
  });

  describe('updateEnabledSkills', () => {
    it('replaces the enabled skills, including with none', async () => {
      const response = await controller.updateEnabledSkills(
        request,
        user,
        BRAND,
        { enabledSkills: [] },
      );

      expect(response.data).toMatchObject({ id: BRAND });
      expect(brand()?.agentConfig).toEqual({
        defaultModel: 'gpt-4o',
        enabledSkills: [],
      });
    });

    it('refuses a skill outside the organization catalog', async () => {
      await expect(
        controller.updateEnabledSkills(request, user, BRAND, {
          enabledSkills: ['content-writing', 'foreign-skill'],
        }),
      ).rejects.toThrow('Unknown skill: foreign-skill');
      expect(brand()?.agentConfig.enabledSkills).toEqual(['seo']);
    });
  });

  it.each([
    [
      'agent config',
      (c: BrandsAgentConfigController) =>
        c.updateAgentConfig(request, orgless, BRAND, validDto),
    ],
    [
      'enabled skills',
      (c: BrandsAgentConfigController) =>
        c.updateEnabledSkills(request, orgless, BRAND, {
          enabledSkills: ['content-writing'],
        }),
    ],
  ])('forbids %s writes without an organization', async (_case, write) => {
    await expect(write(controller)).rejects.toMatchObject({
      response: { detail: 'Organization context is required' },
      status: 403,
    });
    expect(brand()?.agentConfig.enabledSkills).toEqual(['seo']);
  });
});
