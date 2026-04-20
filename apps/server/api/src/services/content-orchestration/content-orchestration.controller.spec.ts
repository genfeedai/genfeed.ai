import { BrandsService } from '@api/collections/brands/services/brands.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ContentOrchestrationController } from '@api/services/content-orchestration/content-orchestration.controller';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import { ContentPipelineQueueService } from '@api/services/content-orchestration/content-pipeline-queue.service';
import { ImageTaskModel, VideoTaskModel } from '@genfeedai/enums';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentOrchestrationController', () => {
  let controller: ContentOrchestrationController;
  let mockBrandsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockQueueService: Record<string, ReturnType<typeof vi.fn>>;
  let mockOrchestrationService: Record<string, ReturnType<typeof vi.fn>>;

  const orgId = 'test-object-id';
  const userId = 'test-object-id';
  const brandId = 'test-object-id';
  const personaId = 'test-object-id';

  const mockReq = {
    organization: { id: orgId },
    user: { id: userId },
  };

  beforeEach(async () => {
    mockBrandsService = {
      findOne: vi.fn().mockResolvedValue({ _id: brandId, organization: orgId }),
    };

    mockQueueService = {
      getJobsByPersona: vi.fn().mockResolvedValue([]),
      queueBatchGenerate: vi.fn().mockResolvedValue('job-batch-1'),
      queueGenerateAndPublish: vi.fn().mockResolvedValue('job-1'),
    };

    mockOrchestrationService = {
      validateSteps: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentOrchestrationController],
      providers: [
        {
          provide: ContentOrchestrationService,
          useValue: mockOrchestrationService,
        },
        {
          provide: ContentPipelineQueueService,
          useValue: mockQueueService,
        },
        { provide: BrandsService, useValue: mockBrandsService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContentOrchestrationController>(
      ContentOrchestrationController,
    );
  });

  describe('generateAndPublish', () => {
    const dto = {
      brandId,
      prompt: 'Test prompt',
      steps: [
        { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
        {
          duration: 5,
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video' as const,
        },
      ],
    };

    it('should queue job when brand belongs to organization', async () => {
      const result = await controller.generateAndPublish(
        personaId,
        mockReq,
        dto,
      );

      expect(result).toEqual({
        jobId: 'job-1',
        status: 'queued',
        stepCount: 2,
      });
      expect(mockBrandsService.findOne).toHaveBeenCalledWith({
        _id: expect.any(String),
        organization: expect.any(String),
      });
      expect(mockQueueService.queueGenerateAndPublish).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when brand does not belong to organization', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.generateAndPublish(personaId, mockReq, dto),
      ).rejects.toThrow(ForbiddenException);

      expect(mockQueueService.queueGenerateAndPublish).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when steps is empty', async () => {
      await expect(
        controller.generateAndPublish(personaId, mockReq, {
          ...dto,
          steps: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('batchGenerate', () => {
    const dto = {
      brandId,
      items: [
        {
          prompt: 'Prompt 1',
          steps: [
            { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
          ],
        },
      ],
    };

    it('should validate brand ownership before queuing batch', async () => {
      const result = await controller.batchGenerate(personaId, mockReq, dto);

      expect(result.status).toBe('queued');
      expect(mockBrandsService.findOne).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for unauthorized brand in batch', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.batchGenerate(personaId, mockReq, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPipelineStatus', () => {
    it('should return jobs for persona', async () => {
      const result = await controller.getPipelineStatus(personaId, {
        organization: { id: orgId },
      });

      expect(result).toEqual({ jobs: [], personaId });
    });
  });
});
