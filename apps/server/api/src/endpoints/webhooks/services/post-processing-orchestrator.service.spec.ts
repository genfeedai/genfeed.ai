import type { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PostProcessingOrchestratorService } from '@api/endpoints/webhooks/services/post-processing-orchestrator.service';
import type { StoryboardNotificationContextService } from '@api/endpoints/webhooks/services/storyboard-notification-context.service';
import type { BotCallbackResponderService } from '@api/services/bot-gateway/services/bot-callback-responder.service';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { EvaluationType, IngredientCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Wiring {
  hasEvaluations?: boolean;
  hasIssuer?: boolean;
  isAuthorizedDelivery?: boolean;
  storyboard?: { runId: string; title: string };
}

/** Drain the `setImmediate` the trigger schedules, plus its awaited chain. */
async function flushBackgroundWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

const ingredientOf = (fields: Record<string, unknown>) =>
  ({
    brandId: 'brand_1',
    category: IngredientCategory.IMAGE,
    id: 'ingredient_1',
    organizationId: 'org_1',
    userId: 'user_1',
    ...fields,
  }) as unknown as IngredientDocument;

describe('PostProcessingOrchestratorService', () => {
  // What leaves the service: bot messages, grants, evaluations and errors.
  let botMessages: unknown[][];
  let grants: [string, string[]][];
  let evaluations: unknown[][];
  let settingsReads: unknown[];
  let errors: string[];
  let isBotGatewayDown: boolean;
  let autoEvaluateOrgs: Set<string>;

  const build = ({
    hasEvaluations = true,
    hasIssuer = false,
    isAuthorizedDelivery = false,
    storyboard,
  }: Wiring = {}) =>
    new PostProcessingOrchestratorService(
      {
        sendCompletionResponse: async (...message: unknown[]) => {
          botMessages.push(['completed', ...message]);
        },
        sendErrorResponse: async (...message: unknown[]) => {
          if (isBotGatewayDown) throw new Error('Bot gateway down');
          botMessages.push(['failed', ...message]);
        },
      } as unknown as BotCallbackResponderService,
      {
        ingredientsEndpoint: 'https://cdn.example.com',
        isAuthorizedMediaDeliveryEnabled: isAuthorizedDelivery,
      } as unknown as ConfigService,
      {
        findOneSelect: async (where: { organizationId?: string }) => {
          settingsReads.push(where);
          return {
            isAutoEvaluateEnabled: autoEvaluateOrgs.has(
              where.organizationId ?? '',
            ),
          };
        },
      } as unknown as OrganizationSettingsService,
      {
        debug: () => undefined,
        error: (message: string) => {
          errors.push(message);
        },
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
      hasEvaluations
        ? ({
            evaluateContent: async (...evaluation: unknown[]) => {
              evaluations.push(evaluation);
            },
          } as unknown as EvaluationsService)
        : undefined,
      hasIssuer
        ? ({
            issueServerPublish: async (org: string, ids: string[]) => {
              grants.push([org, ids]);
              return new Map(ids.map((id) => [id, `https://grant/${id}`]));
            },
          } as unknown as AuthorizedMediaUrlService)
        : undefined,
      storyboard
        ? ({
            find: async () => storyboard,
          } as unknown as StoryboardNotificationContextService)
        : undefined,
    );

  beforeEach(() => {
    botMessages = [];
    grants = [];
    evaluations = [];
    settingsReads = [];
    errors = [];
    isBotGatewayDown = false;
    autoEvaluateOrgs = new Set(['org_1']);
  });

  describe('findStoryboardContext', () => {
    const ingredient = { organizationId: 'org-1', sourceActionId: 'x' };

    it('returns the storyboard found for the ingredient', async () => {
      const storyboard = { runId: 'run-1', title: 'Steam shots' };

      await expect(
        build({ storyboard }).findStoryboardContext(ingredient),
      ).resolves.toEqual(storyboard);
    });

    it('returns null when no storyboard lookup is wired', async () => {
      await expect(build().findStoryboardContext(ingredient)).resolves.toBe(
        null,
      );
    });
  });

  describe('bot gateway notifications', () => {
    it.each([
      [
        IngredientCategory.VIDEO,
        'https://cdn.example.com/videos/ing-1',
        'video',
      ],
      [
        IngredientCategory.IMAGE,
        'https://cdn.example.com/images/ing-1',
        'image',
      ],
    ])(
      'sends the canonical %s URL to the bot that asked',
      async (category, url, mediaType) => {
        build().notifyBotGatewayIfNeeded('ing-1', category);
        await flushBackgroundWork();

        expect(botMessages).toEqual([['completed', 'ing-1', url, mediaType]]);
      },
    );

    it('sends a short-lived grant instead of the canonical URL once delivery is authorized', async () => {
      build({
        hasIssuer: true,
        isAuthorizedDelivery: true,
      }).notifyBotGatewayIfNeeded('ing-1', IngredientCategory.VIDEO, 'org-1');
      await flushBackgroundWork();

      expect(grants).toEqual([['org-1', ['ing-1']]]);
      expect(botMessages).toEqual([
        ['completed', 'ing-1', 'https://grant/ing-1', 'video'],
      ]);
    });

    it.each([
      ['no grant issuer is wired', { isAuthorizedDelivery: true }, 'org-1'],
      [
        'the ingredient has no organization',
        { hasIssuer: true, isAuthorizedDelivery: true },
        undefined,
      ],
    ])(
      'sends nothing when delivery is authorized but %s',
      async (_case, wiring, organizationId) => {
        build(wiring).notifyBotGatewayIfNeeded(
          'ing-1',
          IngredientCategory.VIDEO,
          organizationId,
        );
        await flushBackgroundWork();

        expect(botMessages).toEqual([]);
        expect(errors).toEqual([
          'PostProcessingOrchestratorService notifyBotGatewayIfNeeded failed',
        ]);
      },
    );

    it('forwards failed generation details to the bot gateway', async () => {
      build().notifyBotGatewayFailureIfNeeded('ing-1', 'Provider timed out');
      await flushBackgroundWork();

      expect(botMessages).toEqual([['failed', 'ing-1', 'Provider timed out']]);
    });

    it('logs a failure notice the bot gateway could not take', async () => {
      isBotGatewayDown = true;

      build().notifyBotGatewayFailureIfNeeded('ing-1', 'Provider timed out');
      await flushBackgroundWork();

      expect(errors).toEqual([
        'PostProcessingOrchestratorService bot failure notification failed',
      ]);
    });
  });

  describe('triggerAutoEvaluationIfEnabled', () => {
    it.each([
      ['an image', {}],
      ['a video', { category: IngredientCategory.VIDEO }],
    ])(
      'evaluates %s before publication with canonical scalar keys',
      async (_case, fields) => {
        const ingredient = ingredientOf(fields);

        build().triggerAutoEvaluationIfEnabled(ingredient);
        await flushBackgroundWork();

        expect(settingsReads).toEqual([{ organizationId: 'org_1' }]);
        expect(evaluations).toEqual([
          [
            ingredient.category,
            'ingredient_1',
            EvaluationType.PRE_PUBLICATION,
            'org_1',
            'user_1',
            'brand_1',
          ],
        ]);
      },
    );

    it.each([
      [
        'auto-evaluation is off for the organization',
        { organizationId: 'org_2' },
      ],
      ['the category is not evaluated', { category: IngredientCategory.AUDIO }],
      ['the ingredient has no user', { userId: undefined }],
      ['the ingredient has no brand', { brandId: null }],
    ])('evaluates nothing when %s', async (_case, fields) => {
      build().triggerAutoEvaluationIfEnabled(ingredientOf(fields));
      await flushBackgroundWork();

      expect(evaluations).toEqual([]);
    });

    it('evaluates nothing when no evaluations service is wired', async () => {
      build({ hasEvaluations: false }).triggerAutoEvaluationIfEnabled(
        ingredientOf({}),
      );
      await flushBackgroundWork();

      expect(settingsReads).toEqual([]);
      expect(evaluations).toEqual([]);
    });

    it('fails closed instead of running an unscoped settings lookup when no organization id resolves', async () => {
      // `normalizeWhere` drops `undefined` filter values, so passing an
      // unresolved alias through would degrade this tenant-scoped lookup into
      // an unscoped `findFirst` that reads another organization's
      // auto-evaluate setting — and then feed that foreign id into
      // `evaluateContent`.
      build().triggerAutoEvaluationIfEnabled(
        ingredientOf({ organizationId: undefined }),
      );
      await flushBackgroundWork();

      expect(settingsReads).toEqual([]);
      expect(evaluations).toEqual([]);
      expect(errors).toEqual([
        'PostProcessingOrchestratorService ingredient is missing an organization id',
      ]);
    });
  });
});
