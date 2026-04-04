import { AiActionsController } from '@api/endpoints/ai-actions/ai-actions.controller';
import type { AiActionResult } from '@api/endpoints/ai-actions/ai-actions.service';
import { AiActionsService } from '@api/endpoints/ai-actions/ai-actions.service';
import { ExecuteAiActionDto } from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Test, TestingModule } from '@nestjs/testing';

describe('AiActionsController', () => {
  let controller: AiActionsController;
  let aiActionsService: vi.Mocked<AiActionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiActionsController],
      providers: [
        {
          provide: AiActionsService,
          useValue: {
            execute: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiActionsController>(AiActionsController);
    aiActionsService = module.get(AiActionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('execute', () => {
    it('should execute AI action successfully', async () => {
      const orgId = 'org_123';
      const dto: ExecuteAiActionDto = {
        action: 'caption_generate',
        content: 'A beautiful sunset over the ocean',
        context: { brand: 'TestBrand' },
      };

      const expectedResult: AiActionResult = {
        isByok: false,
        result: 'Generated caption: Embrace the beauty of nature',
        tokensUsed: 150,
      };

      aiActionsService.execute.mockResolvedValue(expectedResult);

      const result = await controller.execute(orgId, dto);

      expect(aiActionsService.execute).toHaveBeenCalledWith(orgId, dto);
      expect(result).toEqual(expectedResult);
    });

    it('should handle execution with BYOK', async () => {
      const orgId = 'org_456';
      const dto: ExecuteAiActionDto = {
        action: 'hook_improve',
        content: 'Original hook text',
      };

      const expectedResult: AiActionResult = {
        isByok: true,
        result: 'Improved hook text',
        tokensUsed: 200,
      };

      aiActionsService.execute.mockResolvedValue(expectedResult);

      const result = await controller.execute(orgId, dto);

      expect(result.isByok).toBe(true);
      expect(result.result).toBe('Improved hook text');
    });

    it('should propagate service errors', async () => {
      const orgId = 'org_789';
      const dto: ExecuteAiActionDto = {
        action: 'invalid_action',
        content: 'test',
      };

      const error = new Error('Unknown action type: invalid_action');
      aiActionsService.execute.mockRejectedValue(error);

      await expect(controller.execute(orgId, dto)).rejects.toThrow(error);
    });
  });
});
