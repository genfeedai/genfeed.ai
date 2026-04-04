import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import { IngredientCategory } from '@genfeedai/enums';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PostProcessingOrchestratorService', () => {
  let service: PostProcessingOrchestratorService;
  let botGatewayService: { generationService: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn>; isProduction?: boolean };
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let evaluationsService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    botGatewayService = {
      generationService: {
        getCallbackContext: vi.fn(),
      },
      sendCompletionResponse: vi.fn(),
    };
    configService = {
      ingredientsEndpoint: 'https://cdn.example.com',
    };
    organizationSettingsService = {
      findOne: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    evaluationsService = {
      evaluateContent: vi.fn(),
    };

    service = new PostProcessingOrchestratorService(
      botGatewayService,
      configService,
      organizationSettingsService,
      loggerService,
      evaluationsService,
    );
  });

  describe('notifyBotGatewayIfNeeded', () => {
    it('should not crash when no callback context', () => {
      botGatewayService.generationService.getCallbackContext.mockReturnValue(
        null,
      );

      expect(() =>
        service.notifyBotGatewayIfNeeded('ing-1', IngredientCategory.VIDEO),
      ).not.toThrow();
    });
  });

  describe('triggerAutoEvaluationIfEnabled', () => {
    it('should not crash when evaluationsService is not available', () => {
      const serviceWithoutEval = new PostProcessingOrchestratorService(
        botGatewayService,
        configService,
        organizationSettingsService,
        loggerService,
        undefined,
      );

      const ingredient = {
        _id: new Types.ObjectId(),
        category: IngredientCategory.IMAGE,
        organization: new Types.ObjectId(),
        user: { _id: new Types.ObjectId(), clerkId: 'clerk_1' },
      } as unknown as IngredientEntity;

      expect(() =>
        serviceWithoutEval.triggerAutoEvaluationIfEnabled(ingredient),
      ).not.toThrow();
    });

    it('should not crash when org settings not found', () => {
      organizationSettingsService.findOne.mockResolvedValue(null);

      const ingredient = {
        _id: new Types.ObjectId(),
        category: IngredientCategory.IMAGE,
        organization: new Types.ObjectId(),
        user: { _id: new Types.ObjectId(), clerkId: 'clerk_1' },
      } as unknown as IngredientEntity;

      expect(() =>
        service.triggerAutoEvaluationIfEnabled(ingredient),
      ).not.toThrow();
    });
  });
});
