import { readFileSync } from 'node:fs';
import { PromptsController } from '@api/collections/prompts/controllers/prompts.controller';
import { PromptsOperationsController } from '@api/collections/prompts/controllers/prompts-operations.controller';
import { PromptsTransformationsController } from '@api/collections/prompts/controllers/prompts-transformations.controller';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { PromptTransformationService } from '@api/collections/prompts/services/prompt-transformation.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ActivitySource } from '@genfeedai/contracts';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Prompts split controllers', () => {
  it.each([
    ['parse', 'parse', 'PromptsOperationsController.parse'],
    [
      'createRemix',
      ':promptId/remix',
      'PromptsOperationsController.createRemix',
    ],
    [
      'enhanceExisting',
      ':promptId/enhance',
      'PromptsOperationsController.enhanceExisting',
    ],
  ] as const)(
    'preserves PromptsOperationsController.%s route and OpenAPI identity',
    (methodName, path, operationId) => {
      const handler = Reflect.get(
        PromptsTransformationsController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, PromptsTransformationsController),
      ).toBe('prompts');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId, summary: methodName });
    },
  );

  it('preserves shared role and credit interception boundaries', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PromptsTransformationsController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        PromptsTransformationsController,
      ),
    ).toContain(CreditsInterceptor);
  });

  it.each(['createRemix', 'enhanceExisting'] as const)(
    'preserves subscription, credit guard, and credit metadata for %s',
    (methodName) => {
      const handler = Reflect.get(
        PromptsTransformationsController.prototype,
        methodName,
      ) as object;
      const source =
        methodName === 'createRemix'
          ? ActivitySource.PROMPT_REMIX
          : ActivitySource.PROMPT_ENHANCEMENT;

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        SubscriptionGuard,
        CreditsGuard,
      ]);
      expect(Reflect.getMetadata(CREDITS_KEY, handler)).toMatchObject({
        modelKey: DEFAULT_MINI_TEXT_MODEL,
        source,
      });
    },
  );

  it('preserves LogMethod on every moved transport', () => {
    const source = readFileSync(
      new URL('./prompts-transformations.controller.ts', import.meta.url),
      'utf8',
    );
    const decorators = source.match(
      /@LogMethod\(\{ logEnd: false, logError: true, logStart: true \}\)/g,
    );

    expect(decorators).toHaveLength(3);
  });

  it('registers transformation and operation siblings before wildcard CRUD', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PromptsModule),
    ).toEqual([
      PromptsTransformationsController,
      PromptsOperationsController,
      PromptsController,
    ]);
  });

  it('registers transformation orchestration in the owning module', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PromptsModule),
    ).toContain(PromptTransformationService);
  });

  it.each(['parse', 'createRemix', 'enhanceExisting'] as const)(
    'removes moved handler %s from the operations controller',
    (methodName) => {
      expect(
        Reflect.get(PromptsOperationsController.prototype, methodName),
      ).toBeUndefined();
    },
  );

  it.each([
    './prompts-operations.controller.ts',
    './prompts-transformations.controller.ts',
    '../services/prompt-transformation.service.ts',
  ])('keeps %s below 500 lines', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    expect(source.trimEnd().split('\n').length).toBeLessThan(500);
  });
});
