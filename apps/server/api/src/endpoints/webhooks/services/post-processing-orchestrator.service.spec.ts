import type { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import type { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import { EvaluationType, IngredientCategory } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Drain the `setImmediate` the trigger schedules, plus its awaited chain. */
async function flushBackgroundWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('PostProcessingOrchestratorService', () => {
  let service: PostProcessingOrchestratorService;
  let botGatewayService: {
    sendCompletionResponse: ReturnType<typeof vi.fn>;
    sendErrorResponse: ReturnType<typeof vi.fn>;
  };
  let configService: { ingredientsEndpoint: string };
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let evaluationsService: { evaluateContent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    botGatewayService = {
      sendCompletionResponse: vi.fn().mockResolvedValue(undefined),
      sendErrorResponse: vi.fn().mockResolvedValue(undefined),
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
      botGatewayService as unknown as BotGatewayService,
      configService as unknown as ConfigService,
      organizationSettingsService as unknown as OrganizationSettingsService,
      loggerService as unknown as LoggerService,
      evaluationsService as unknown as EvaluationsService,
    );
  });

  describe('notifyBotGatewayIfNeeded', () => {
    it('delegates completion lookup and delivery to the bot gateway', async () => {
      service.notifyBotGatewayIfNeeded('ing-1', IngredientCategory.VIDEO);
      await flushBackgroundWork();

      expect(botGatewayService.sendCompletionResponse).toHaveBeenCalledWith(
        'ing-1',
        'https://cdn.example.com/videos/ing-1',
        'video',
      );
    });

    it('forwards failed generation details to the bot gateway', async () => {
      service.notifyBotGatewayFailureIfNeeded('ing-1', 'Provider timed out');
      await flushBackgroundWork();

      expect(botGatewayService.sendErrorResponse).toHaveBeenCalledWith(
        'ing-1',
        'Provider timed out',
      );
    });
  });

  describe('triggerAutoEvaluationIfEnabled', () => {
    it('should not crash when evaluationsService is not available', () => {
      const serviceWithoutEval = new PostProcessingOrchestratorService(
        botGatewayService as unknown as BotGatewayService,
        configService as unknown as ConfigService,
        organizationSettingsService as unknown as OrganizationSettingsService,
        loggerService as unknown as LoggerService,
        undefined,
      );

      const ingredient = {
        id: 'test-object-id',
        category: IngredientCategory.IMAGE,
        organizationId: 'test-object-id',
        userId: 'test-object-id',
      } as unknown as IngredientDocument;

      expect(() =>
        serviceWithoutEval.triggerAutoEvaluationIfEnabled(ingredient),
      ).not.toThrow();
    });

    it('should not crash when org settings not found', () => {
      organizationSettingsService.findOne.mockResolvedValue(null);

      const ingredient = {
        id: 'test-object-id',
        category: IngredientCategory.IMAGE,
        organizationId: 'test-object-id',
        userId: 'test-object-id',
      } as unknown as IngredientDocument;

      expect(() =>
        service.triggerAutoEvaluationIfEnabled(ingredient),
      ).not.toThrow();
    });

    it('scopes auto-evaluation with canonical scalar foreign keys', async () => {
      organizationSettingsService.findOne.mockResolvedValue({
        isAutoEvaluateEnabled: true,
      });

      const ingredient = {
        brandId: 'brand_1',
        category: IngredientCategory.IMAGE,
        id: 'ingredient_1',
        organizationId: 'org_1',
        userId: 'user_1',
      } as unknown as IngredientDocument;

      service.triggerAutoEvaluationIfEnabled(ingredient);
      await flushBackgroundWork();

      expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
        organizationId: 'org_1',
      });
      expect(evaluationsService.evaluateContent).toHaveBeenCalledWith(
        IngredientCategory.IMAGE,
        'ingredient_1',
        EvaluationType.PRE_PUBLICATION,
        'org_1',
        'user_1',
        'brand_1',
      );
    });

    it('fails closed instead of running an unscoped settings lookup when no organization id resolves', async () => {
      // `normalizeWhere` drops `undefined` filter values, so passing an
      // unresolved alias through would degrade this tenant-scoped lookup into
      // an unscoped `findFirst` that reads another organization's
      // auto-evaluate setting — and then feed that foreign id into
      // `evaluateContent`.
      const ingredient = {
        brandId: 'brand_1',
        category: IngredientCategory.IMAGE,
        id: 'ingredient_1',
        userId: 'user_1',
      } as unknown as IngredientDocument;

      service.triggerAutoEvaluationIfEnabled(ingredient);
      await flushBackgroundWork();

      expect(organizationSettingsService.findOne).not.toHaveBeenCalled();
      expect(evaluationsService.evaluateContent).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('missing an organization id'),
        { ingredientId: 'ingredient_1' },
      );
    });
  });
});
