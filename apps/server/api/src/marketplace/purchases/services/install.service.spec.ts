import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { InstallService } from '@api/marketplace/purchases/services/install.service';
import { ListingType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('InstallService', () => {
  let service: InstallService;
  let listingsService: { findOne: ReturnType<typeof vi.fn> };
  let workflowsService: { createWorkflow: ReturnType<typeof vi.fn> };
  let promptsService: { create: ReturnType<typeof vi.fn> };
  let skillsService: { createSkill: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const userId = 'user-1';
  const orgId = new Types.ObjectId().toString();
  const listingId = new Types.ObjectId().toString();

  beforeEach(async () => {
    listingsService = { findOne: vi.fn() };
    workflowsService = { createWorkflow: vi.fn() };
    promptsService = { create: vi.fn() };
    skillsService = { createSkill: vi.fn() };
    logger = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallService,
        { provide: ListingsService, useValue: listingsService },
        { provide: WorkflowsService, useValue: workflowsService },
        { provide: PromptsService, useValue: promptsService },
        { provide: SkillsService, useValue: skillsService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(InstallService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('installToWorkspace', () => {
    it('should throw NotFoundException when listing not found', async () => {
      listingsService.findOne.mockResolvedValue(null);

      await expect(
        service.installToWorkspace(listingId, userId, orgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should install a WORKFLOW listing and return resourceType workflow', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: {
          edges: [],
          name: 'Flow Name',
          nodes: [{ id: 'n1' }],
        },
        title: 'My Workflow',
        type: ListingType.WORKFLOW,
      });
      workflowsService.createWorkflow.mockResolvedValue({
        _id: new Types.ObjectId(),
        label: 'Flow Name',
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);

      expect(result.resourceType).toBe('workflow');
      expect(result.title).toBe('Flow Name');
      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({ label: 'Flow Name' }),
      );
    });

    it('should install a PROMPT listing and return resourceType prompt', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: {
          category: 'image-generation',
          template: 'a vivid scene of {{subject}}',
        },
        title: 'Cool Prompt',
        type: ListingType.PROMPT,
      });
      promptsService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);

      expect(result.resourceType).toBe('prompt');
      expect(result.title).toBe('Cool Prompt');
      expect(promptsService.create).toHaveBeenCalled();
    });

    it('should install a PRESET listing and return resourceType prompt', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: { category: 'video-generation', template: 'cinematic' },
        title: 'My Preset',
        type: ListingType.PRESET,
      });
      promptsService.create.mockResolvedValue({ _id: new Types.ObjectId() });

      const result = await service.installToWorkspace(listingId, userId, orgId);
      expect(result.resourceType).toBe('prompt');
    });

    it('should install a SKILL listing and return resourceType skill', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: {
          description: 'Generates images',
          files: [{ content: 'export default {}', path: 'index.ts' }],
          slug: 'image-gen',
        },
        title: 'Image Generator Skill',
        type: ListingType.SKILL,
      });
      skillsService.createSkill.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);

      expect(result.resourceType).toBe('skill');
      expect(result.title).toBe('Image Generator Skill');
      expect(skillsService.createSkill).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({ slug: 'image-gen' }),
      );
    });

    it('should derive skill slug from title when slug not in downloadData', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: {},
        title: 'Auto Tag Generator',
        type: ListingType.SKILL,
      });
      skillsService.createSkill.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await service.installToWorkspace(listingId, userId, orgId);

      expect(skillsService.createSkill).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({ slug: 'auto-tag-generator' }),
      );
    });

    it('should throw BadRequestException for unsupported listing type', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: {},
        title: 'Unknown',
        type: 'UNKNOWN_TYPE' as ListingType,
      });

      await expect(
        service.installToWorkspace(listingId, userId, orgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use listing title as workflow label when name not in downloadData', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: {},
        title: 'Fallback Title',
        type: ListingType.WORKFLOW,
      });
      workflowsService.createWorkflow.mockResolvedValue({
        _id: new Types.ObjectId(),
        label: 'Fallback Title',
      });

      const result = await service.installToWorkspace(listingId, userId, orgId);
      expect(result.title).toBe('Fallback Title');
    });

    it('should include sourceListingId in workflow metadata', async () => {
      listingsService.findOne.mockResolvedValue({
        _id: listingId,
        downloadData: { name: 'WF' },
        title: 'Workflow',
        type: ListingType.WORKFLOW,
      });
      workflowsService.createWorkflow.mockResolvedValue({
        _id: new Types.ObjectId(),
        label: 'WF',
      });

      await service.installToWorkspace(listingId, userId, orgId);

      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            createdFrom: 'marketplace',
            sourceListingId: listingId,
          }),
        }),
      );
    });
  });
});
