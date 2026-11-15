import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { SkillsService } from '@api/collections/skills/services/skills.service';
import type { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  MarketplaceApiClient,
  MarketplaceInstallPayloadResult,
} from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { ListingType, PromptCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

interface ListingDownload {
  downloadData: Record<string, unknown>;
  title: string;
  type: string;
}

interface Workspace {
  prompts: Array<Record<string, unknown> & { id: string }>;
  skills: Array<{ input: Record<string, unknown>; organizationId: string }>;
  workflows: Array<{
    input: Record<string, unknown>;
    organizationId: string;
    userId: string;
  }>;
}

describe('MarketplaceInstallService', () => {
  const userId = 'user-1';
  const orgId = 'org-1';
  const listingId = 'listing-1';
  const buyerToken = 'buyer-token';

  let listings: Map<string, ListingDownload>;
  let workspace: Workspace;
  let errors: string[];
  let marketplaceIsDown: boolean;
  let service: MarketplaceInstallService;

  function publish(listing: ListingDownload): void {
    listings.set(listingId, listing);
  }

  beforeEach(() => {
    listings = new Map();
    marketplaceIsDown = false;
    workspace = { prompts: [], skills: [], workflows: [] };
    errors = [];

    service = new MarketplaceInstallService(
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: () => undefined,
      } as unknown as LoggerService,
      {
        // Only the buyer token has a completed purchase of the listing.
        getInstallPayload: async (
          id: string,
          token: string,
        ): Promise<MarketplaceInstallPayloadResult> => {
          if (marketplaceIsDown) return { status: 'unavailable' };
          if (token === 'expired') return { status: 'unauthorized' };
          const listing = listings.get(id);
          if (!listing) return { status: 'not-found' };
          if (token !== buyerToken) return { status: 'not-purchased' };
          return {
            payload: { ...listing, listingId: id, purchaseId: 'purchase-1' },
            status: 'ok',
          };
        },
      } as unknown as MarketplaceApiClient,
      {
        createWorkflow: async (
          creatorId: string,
          organizationId: string,
          input: Record<string, unknown>,
        ) => {
          workspace.workflows.push({
            input,
            organizationId,
            userId: creatorId,
          });
          return {
            id: `wf-${workspace.workflows.length}`,
            label: input.label,
          };
        },
      } as unknown as WorkflowsService,
      {
        create: async (input: Record<string, unknown>) => {
          const prompt = { ...input, id: `p-${workspace.prompts.length + 1}` };
          workspace.prompts.push(prompt);
          return prompt;
        },
      } as unknown as PromptsService,
      {
        createSkill: async (
          organizationId: string,
          input: Record<string, unknown>,
        ) => {
          workspace.skills.push({ input, organizationId });
          return { id: `s-${workspace.skills.length}` };
        },
      } as unknown as SkillsService,
    );
  });

  it('throws NotFoundException when the listing does not exist', async () => {
    await expect(
      service.installToWorkspace(listingId, userId, orgId, buyerToken),
    ).rejects.toBeInstanceOf(NotFoundException);
    // @HandleErrors logs before re-throwing
    expect(errors).toHaveLength(1);
    expect(workspace).toEqual({ prompts: [], skills: [], workflows: [] });
  });

  describe('ownership', () => {
    beforeEach(() => {
      publish({
        downloadData: { nodes: [{ id: 'n1' }] },
        title: 'Paid Flow',
        type: ListingType.WORKFLOW,
      });
    });

    it('refuses a buyer with no completed purchase and creates nothing', async () => {
      await expect(
        service.installToWorkspace(listingId, userId, orgId, 'other-buyer'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(workspace).toEqual({ prompts: [], skills: [], workflows: [] });
    });

    it('refuses a call that carries no buyer token', async () => {
      await expect(
        service.installToWorkspace(listingId, userId, orgId, undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(workspace).toEqual({ prompts: [], skills: [], workflows: [] });
    });

    it('refuses a token the marketplace rejects', async () => {
      await expect(
        service.installToWorkspace(listingId, userId, orgId, 'expired'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(workspace).toEqual({ prompts: [], skills: [], workflows: [] });
    });

    it('reports an unreachable marketplace as unavailable and creates nothing', async () => {
      marketplaceIsDown = true;
      await expect(
        service.installToWorkspace(listingId, userId, orgId, buyerToken),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(workspace).toEqual({ prompts: [], skills: [], workflows: [] });
    });
  });

  it('throws BadRequestException for an unsupported listing type', async () => {
    publish({
      downloadData: {},
      title: 'Mystery',
      type: 'something-unsupported',
    });

    await expect(
      service.installToWorkspace(listingId, userId, orgId, buyerToken),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(workspace).toEqual({ prompts: [], skills: [], workflows: [] });
  });

  describe('workflow install', () => {
    it('creates a workflow from the marketplace download data', async () => {
      publish({
        downloadData: {
          edges: [{ id: 'e1' }],
          name: 'Imported Flow',
          nodes: [{ id: 'n1' }],
        },
        title: 'Flow Listing',
        type: ListingType.WORKFLOW,
      });

      const result = await service.installToWorkspace(
        listingId,
        userId,
        orgId,
        buyerToken,
      );

      expect(result).toEqual({
        resourceId: 'wf-1',
        resourceType: 'workflow',
        title: 'Imported Flow',
      });
      expect(workspace.workflows).toEqual([
        {
          input: {
            edges: [{ id: 'e1' }],
            label: 'Imported Flow',
            metadata: {
              createdFrom: 'marketplace',
              sourceListingId: listingId,
              sourceType: 'marketplace-listing',
            },
            nodes: [{ id: 'n1' }],
            trigger: 'manual',
          },
          organizationId: orgId,
          userId,
        },
      ]);
    });

    it('defaults missing nodes/edges/name and falls back to the listing title', async () => {
      publish({
        downloadData: {},
        title: 'Fallback Title',
        type: ListingType.WORKFLOW,
      });

      const result = await service.installToWorkspace(
        listingId,
        userId,
        orgId,
        buyerToken,
      );

      expect(result.title).toBe('Fallback Title');
      expect(workspace.workflows[0]?.input).toEqual(
        expect.objectContaining({
          edges: [],
          label: 'Fallback Title',
          nodes: [],
        }),
      );
    });
  });

  describe('prompt / preset install', () => {
    it.each([
      ['video-generation', PromptCategory.PRESET_DESCRIPTION_VIDEO],
      ['image-generation', PromptCategory.PRESET_DESCRIPTION_IMAGE],
      ['music-generation', PromptCategory.PRESET_DESCRIPTION_MUSIC],
      ['unknown', PromptCategory.PRESET_DESCRIPTION_IMAGE],
    ])(
      'stores a %s prompt as a favorite owned by the installing user',
      async (category, expected) => {
        publish({
          downloadData: { category, template: 'Make something' },
          title: 'A Prompt',
          type: ListingType.PROMPT,
        });

        const result = await service.installToWorkspace(
          listingId,
          userId,
          orgId,
          buyerToken,
        );

        expect(result).toEqual({
          resourceId: 'p-1',
          resourceType: 'prompt',
          title: 'A Prompt',
        });
        expect(workspace.prompts).toEqual([
          {
            category: expected,
            id: 'p-1',
            isFavorite: true,
            organizationId: orgId,
            original: 'Make something',
            userId,
          },
        ]);
      },
    );

    it('uses the title as the template for a preset without one', async () => {
      publish({
        downloadData: {},
        title: 'Preset Title',
        type: ListingType.PRESET,
      });

      await service.installToWorkspace(listingId, userId, orgId, buyerToken);

      expect(workspace.prompts[0]).toEqual(
        expect.objectContaining({
          category: PromptCategory.PRESET_DESCRIPTION_IMAGE,
          original: 'Preset Title',
        }),
      );
    });
  });

  describe('skill install', () => {
    it('creates a skill using the provided slug and files', async () => {
      publish({
        downloadData: {
          description: 'A skill',
          files: [{ content: 'x', path: 'a.md' }],
          slug: 'my-skill',
        },
        title: 'Skill Title',
        type: ListingType.SKILL,
      });

      const result = await service.installToWorkspace(
        listingId,
        userId,
        orgId,
        buyerToken,
      );

      expect(result).toEqual({
        resourceId: 's-1',
        resourceType: 'skill',
        title: 'Skill Title',
      });
      expect(workspace.skills).toEqual([
        {
          input: {
            description: 'A skill',
            files: [{ content: 'x', path: 'a.md' }],
            slug: 'my-skill',
            sourceListingId: listingId,
            title: 'Skill Title',
          },
          organizationId: orgId,
        },
      ]);
    });

    it('derives a slug from the title when none is provided', async () => {
      publish({
        downloadData: {},
        title: 'My Cool Skill',
        type: ListingType.SKILL,
      });

      await service.installToWorkspace(listingId, userId, orgId, buyerToken);

      expect(workspace.skills[0]?.input).toEqual(
        expect.objectContaining({ files: [], slug: 'my-cool-skill' }),
      );
    });
  });
});
