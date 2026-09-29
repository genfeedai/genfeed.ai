import { readFileSync } from 'node:fs';
import { PromptsTransformationsController } from '@api/collections/prompts/controllers/prompts-transformations.controller';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
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

      if (methodName === 'createRemix') {
        expect(Reflect.getMetadata(CREDITS_KEY, handler)).toMatchObject({
          modelKey: DEFAULT_MINI_TEXT_MODEL,
          source,
        });
        return;
      }

      // enhanceExisting (#5161) resolves its model through the Admin
      // default TEXT registry at call time, so credits are deferred until
      // the resolved model is known instead of pinned to a static modelKey.
      expect(Reflect.getMetadata(CREDITS_KEY, handler)).toMatchObject({
        source,
      });
      expect(
        Reflect.getMetadata(CREDITS_DEFER_MODEL_RESOLUTION_KEY, handler),
      ).toBe(true);
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
