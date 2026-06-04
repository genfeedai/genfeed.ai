import type { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { ListingType, PromptCategory } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MarketplaceInstallService', () => {
  let service: MarketplaceInstallService;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let apiClient: { getListingDownloadData: ReturnType<typeof vi.fn> };
  let workflowsService: { createWorkflow: ReturnType<typeof vi.fn> };
  let promptsService: { create: ReturnType<typeof vi.fn> };
  let skillsService: { createSkill: ReturnType<typeof vi.fn> };

  const userId = 'user-1';
  const orgId = 'org-1';
  const listingId = 'listing-1';

  beforeEach(() => {
    vi.clearAllMocks();
    logger = { error: vi.fn(), log: vi.fn() };
    apiClient = { getListingDownloadData: vi.fn() };
    workflowsService = { createWorkflow: vi.fn() };
    promptsService = { create: vi.fn() };
    skillsService = { createSkill: vi.fn() };

    service = new MarketplaceInstallService(
      logger as unknown as LoggerService,
      apiClient as unknown as MarketplaceApiClient,
      workflowsService as never,
      promptsService as never,
      skillsService as never,
    );
  });

  it('throws NotFoundException when the listing download data is missing', async () => {
    apiClient.getListingDownloadData.mockResolvedValue(null);
    await expect(
      service.installToWorkspace(listingId, userId, orgId),
    ).rejects.toBeInstanceOf(NotFoundException);
    // @HandleErrors logs before re-throwing
    expect(logger.error).toHaveBeenCalled();
  });

  it('throws BadRequestException for an unsupported listing type', async () => {
    apiClient.getListingDownloadData.mockResolvedValue({
      downloadData: {},
      title: 'Mystery',
      type: 'something-unsupported',
    });
    await expect(
      service.installToWorkspace(listingId, userId, orgId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('workflow install', () => {
    it('creates a workflow from the marketplace download data', async () => {
      apiClient.getListingDownloadData.mockResolvedValue({
        downloadData: {
          edges: [{ id: 'e1' }],
          name: 'Imported Flow',
          nodes: [{ id: 'n1' }],
        },
        title: 'Flow Listing',
        type: ListingType.WORKFLOW,
      });
      workflowsService.createWorkflow.mockResolvedValue({
        _id: { toString: () => 'wf-1' },
        label: 'Imported Flow',
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);

      expect(result).toEqual({
        resourceId: 'wf-1',
        resourceType: 'workflow',
        title: 'Imported Flow',
      });
      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({
          edges: [{ id: 'e1' }],
          label: 'Imported Flow',
          metadata: expect.objectContaining({
            createdFrom: 'marketplace',
            sourceListingId: listingId,
          }),
          nodes: [{ id: 'n1' }],
        }),
      );
    });

    it('defaults missing nodes/edges/name and falls back to the listing title', async () => {
      apiClient.getListingDownloadData.mockResolvedValue({
        downloadData: {},
        title: 'Fallback Title',
        type: ListingType.WORKFLOW,
      });
      workflowsService.createWorkflow.mockResolvedValue({
        _id: { toString: () => 'wf-2' },
        label: '',
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);

      expect(result.title).toBe('Fallback Title');
      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({
          edges: [],
          label: 'Fallback Title',
          nodes: [],
        }),
      );
    });
  });

  describe('prompt / preset install', () => {
    it('maps a known prompt category and creates a favorite prompt', async () => {
      apiClient.getListingDownloadData.mockResolvedValue({
        downloadData: {
          category: 'video-generation',
          template: 'Make a video',
        },
        title: 'Video Prompt',
        type: ListingType.PROMPT,
      });
      promptsService.create.mockResolvedValue({
        _id: { toString: () => 'p-1' },
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);

      expect(result).toEqual({
        resourceId: 'p-1',
        resourceType: 'prompt',
        title: 'Video Prompt',
      });
      expect(promptsService.create).toHaveBeenCalledWith({
        category: PromptCategory.PRESET_DESCRIPTION_VIDEO,
        isFavorite: true,
        organization: orgId,
        original: 'Make a video',
      });
    });

    it('falls back to the image category and title template for unknown categories', async () => {
      apiClient.getListingDownloadData.mockResolvedValue({
        downloadData: {},
        title: 'Preset Title',
        type: ListingType.PRESET,
      });
      promptsService.create.mockResolvedValue({
        _id: { toString: () => 'p-2' },
      });

      await service.installToWorkspace(listingId, userId, orgId);

      expect(promptsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: PromptCategory.PRESET_DESCRIPTION_IMAGE,
          original: 'Preset Title',
        }),
      );
    });
  });

  describe('skill install', () => {
    it('creates a skill using the provided slug and files', async () => {
      apiClient.getListingDownloadData.mockResolvedValue({
        downloadData: {
          description: 'A skill',
          files: [{ content: 'x', path: 'a.md' }],
          slug: 'my-skill',
        },
        title: 'Skill Title',
        type: ListingType.SKILL,
      });
      skillsService.createSkill.mockResolvedValue({
        _id: { toString: () => 's-1' },
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);

      expect(result).toEqual({
        resourceId: 's-1',
        resourceType: 'skill',
        title: 'Skill Title',
      });
      expect(skillsService.createSkill).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          slug: 'my-skill',
          sourceListingId: listingId,
          title: 'Skill Title',
        }),
      );
    });

    it('derives a slug from the title when none is provided', async () => {
      apiClient.getListingDownloadData.mockResolvedValue({
        downloadData: {},
        title: 'My Cool Skill',
        type: ListingType.SKILL,
      });
      skillsService.createSkill.mockResolvedValue({
        _id: { toString: () => 's-2' },
      });

      await service.installToWorkspace(listingId, userId, orgId);

      expect(skillsService.createSkill).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ slug: 'my-cool-skill' }),
      );
    });
  });
});
