import type { ServerFunnelCaptureService } from '@api/services/analytics/server-funnel-capture.service';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import type { WebhookDispatchService } from '@api/services/webhook-client/webhook-dispatch.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Dispatch {
  options: Record<string, unknown>;
  organizationId: string;
  payload: Record<string, unknown>;
}

interface Wiring {
  hasFunnel?: boolean;
}

const occurredAt = new Date('2026-07-07T10:00:00.000Z');

// Prisma filters as Postgres applies them to the ingredient rows.
const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && 'in' in condition) {
      return (condition.in as unknown[]).includes(row[key]);
    }
    if (condition && typeof condition === 'object' && 'not' in condition) {
      return row[key] !== condition.not;
    }
    return row[key] === condition;
  });

/** The fire-and-forget capture chain settles after the emit call returns. */
async function flushBackgroundWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('GenerationEventWebhookService', () => {
  let dispatches: Dispatch[];
  let captures: Record<string, unknown>[];
  let warnings: [string, Record<string, unknown>][];
  let errors: [string, Record<string, unknown>][];
  let ingredients: Row[];
  let dispatchFailure: Error | undefined;
  let isDatabaseDown: boolean;

  const build = ({ hasFunnel = false }: Wiring = {}) => {
    const ingredient = {
      count: async ({ where }: { where: Where }) =>
        ingredients.filter((row) => matches(row, where)).length,
      findFirst: async ({ where }: { where: Where }) => {
        if (isDatabaseDown) throw new Error('db down');
        return ingredients.find((row) => matches(row, where)) ?? null;
      },
    };
    return new GenerationEventWebhookService(
      {
        error: (message: string, context: Record<string, unknown>) => {
          errors.push([message, context]);
        },
        log: () => undefined,
        warn: (message: string, context: Record<string, unknown>) => {
          warnings.push([message, context]);
        },
      } as unknown as LoggerService,
      {
        dispatch: async (
          organizationId: string,
          payload: Record<string, unknown>,
          options: Record<string, unknown>,
        ) => {
          if (dispatchFailure) throw dispatchFailure;
          dispatches.push({ options, organizationId, payload });
          return null;
        },
      } as unknown as WebhookDispatchService,
      hasFunnel ? ({ ingredient } as unknown as PrismaService) : undefined,
      hasFunnel
        ? ({
            capture: async (event: Record<string, unknown>) => {
              captures.push(event);
            },
          } as unknown as ServerFunnelCaptureService)
        : undefined,
    );
  };
  const seedIngredient = (id: string, fields: Row = {}) => {
    ingredients.push({
      category: IngredientCategory.IMAGE,
      id,
      isDeleted: false,
      organizationId: 'org_1',
      status: IngredientStatus.GENERATED,
      userId: 'user_1',
      ...fields,
    });
  };

  beforeEach(() => {
    dispatches = [];
    captures = [];
    warnings = [];
    errors = [];
    ingredients = [];
    dispatchFailure = undefined;
    isDatabaseDown = false;
  });

  it.each(['image', 'video', 'article'] as const)(
    'emits a completed %s generation with a deterministic event id',
    async (kind) => {
      await build().emitGenerationCompleted({
        brandId: 'brand_1',
        generationId: 'generation_1',
        kind,
        model: 'flux-dev',
        occurredAt,
        organizationId: 'org_123',
        output: {
          mimeType: 'image/png',
          storageKey: 'ingredients/images/generation_1',
          url: 'https://cdn.genfeed.ai/generation_1.png',
        },
        provider: 'genfeedai',
      });

      expect(dispatches).toEqual([
        {
          options: expect.objectContaining({
            jobIdPrefix: 'generation-webhook-',
          }),
          organizationId: 'org_123',
          payload: {
            event: 'generation.completed',
            eventId: `generation:generation.completed:${kind}:generation_1:completed`,
            generation: {
              brandId: 'brand_1',
              completedAt: '2026-07-07T10:00:00.000Z',
              error: null,
              id: 'generation_1',
              kind,
              model: 'flux-dev',
              output: {
                mimeType: 'image/png',
                storageKey: 'ingredients/images/generation_1',
                url: 'https://cdn.genfeed.ai/generation_1.png',
              },
              provider: 'genfeedai',
              status: 'completed',
            },
            occurredAt: '2026-07-07T10:00:00.000Z',
            schemaVersion: 1,
            timestamp: '2026-07-07T10:00:00.000Z',
          },
        },
      ]);
    },
  );

  it('normalizes an empty output to null', async () => {
    await build().emitGenerationCompleted({
      generationId: 'generation_1',
      kind: 'video',
      occurredAt,
      organizationId: 'org_123',
      output: { mimeType: null, storageKey: null, url: null },
    });

    expect(dispatches[0]?.payload).toMatchObject({
      generation: { output: null },
    });
  });

  it('classifies and redacts failure detail', async () => {
    await build().emitGenerationFailed({
      errorCode: 'provider_503 api_key=raw-code-key',
      errorMessage: 'Provider timeout 503 with api_key=raw-provider-key',
      generationId: 'generation_1',
      kind: 'image',
      occurredAt,
      organizationId: 'org_123',
      retryable: true,
    });

    const payload = dispatches[0]?.payload;
    expect(payload).toMatchObject({
      event: 'generation.failed',
      eventId: 'generation:generation.failed:image:generation_1:failed',
      generation: {
        error: {
          class: 'provider_outage',
          code: 'provider_503 api_key=[REDACTED]',
          message: 'Provider timeout 503 with api_key=[REDACTED]',
          retryable: true,
        },
        output: null,
        status: 'failed',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('raw-provider-key');
    expect(JSON.stringify(payload)).not.toContain('raw-code-key');
  });

  it('skips emission when the organization or generation id is missing', async () => {
    await build().emitGenerationCompleted({
      generationId: '',
      kind: 'article',
      organizationId: 'org_123',
    });

    expect(dispatches).toEqual([]);
    expect(warnings).toEqual([
      [
        'GenerationEventWebhookService skipped generation webhook',
        { hasGenerationId: false, hasOrganizationId: true, kind: 'article' },
      ],
    ]);
  });

  it('never fails the generation when dispatch throws, and redacts the logged error', async () => {
    dispatchFailure = new Error(
      'Queue unavailable webhook_secret=raw-webhook-secret',
    );

    await expect(
      build().emitGenerationCompleted({
        generationId: 'generation_1',
        kind: 'image',
        organizationId: 'org_123',
      }),
    ).resolves.toBeUndefined();

    expect(errors).toEqual([
      [
        'GenerationEventWebhookService failed to emit generation event',
        {
          error: 'Queue unavailable webhook_secret=[REDACTED]',
          generationId: 'generation_1',
          kind: 'image',
        },
      ],
    ]);
  });

  describe('PostHog activation capture', () => {
    const completed = (generationId: string, kind: 'image' | 'video') => ({
      generationId,
      kind,
      organizationId: 'org_1',
    });

    it("captures generation_completed keyed by the ingredient's user, plus first_successful_generation for the org's first output", async () => {
      seedIngredient('ingredient_1');
      seedIngredient('elsewhere', { organizationId: 'org_2' });

      await build({ hasFunnel: true }).emitGenerationCompleted(
        completed('ingredient_1', 'image'),
      );
      await flushBackgroundWork();

      expect(captures).toEqual([
        {
          distinctId: 'user_1',
          event: 'generation_completed',
          organizationId: 'org_1',
          properties: {
            $groups: { organization: 'org_1' },
            generationType: 'image',
            outcome: 'success',
          },
        },
        {
          distinctId: 'user_1',
          event: 'first_successful_generation',
          organizationId: 'org_1',
          properties: {
            $groups: { organization: 'org_1' },
            generationType: 'image',
          },
        },
      ]);
    });

    it.each([
      [
        'the organization already has a generated output',
        { category: IngredientCategory.IMAGE },
        true,
      ],
      [
        'the output is neither an image nor a video',
        { category: IngredientCategory.VOICE },
        false,
      ],
    ])(
      'captures only generation_completed when %s',
      async (_case, fields, hasEarlierOutput) => {
        seedIngredient('ingredient_2', fields);
        seedIngredient('earlier', {
          isDeleted: !hasEarlierOutput,
          status: IngredientStatus.VALIDATED,
        });

        await build({ hasFunnel: true }).emitGenerationCompleted(
          completed('ingredient_2', 'video'),
        );
        await flushBackgroundWork();

        expect(captures.map(({ event }) => event)).toEqual([
          'generation_completed',
        ]);
      },
    );

    it.each([
      ['the ingredient has no owning user', { userId: null }],
      [
        'the ingredient belongs to another organization',
        { organizationId: 'org_2' },
      ],
    ])('does not capture when %s', async (_case, fields) => {
      seedIngredient('ingredient_3', fields);

      await build({ hasFunnel: true }).emitGenerationCompleted(
        completed('ingredient_3', 'image'),
      );
      await flushBackgroundWork();

      expect(captures).toEqual([]);
    });

    it('never fails the generation when the capture lookup throws', async () => {
      isDatabaseDown = true;

      await expect(
        build({ hasFunnel: true }).emitGenerationCompleted(
          completed('ingredient_4', 'image'),
        ),
      ).resolves.toBeUndefined();
      await flushBackgroundWork();

      expect(captures).toEqual([]);
      expect(warnings).toEqual([
        [
          'GenerationEventWebhookService generation funnel capture skipped',
          {
            error: 'db down',
            generationId: 'ingredient_4',
            organizationId: 'org_1',
          },
        ],
      ]);
    });

    it('does not capture a failed generation', async () => {
      seedIngredient('ingredient_5');

      await build({ hasFunnel: true }).emitGenerationFailed(
        completed('ingredient_5', 'image'),
      );
      await flushBackgroundWork();

      expect(captures).toEqual([]);
      expect(dispatches).toHaveLength(1);
    });
  });
});
