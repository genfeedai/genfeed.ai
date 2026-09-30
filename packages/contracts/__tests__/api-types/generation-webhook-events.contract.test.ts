import { describe, expect, test } from 'vitest';
import {
  classifyGenerationWebhookError,
  createGenerationWebhookEventId,
  createSampleGenerationWebhookPayload,
  GENERATION_WEBHOOK_KINDS,
  GENERATION_WEBHOOK_SCHEMA_VERSION,
  generationWebhookPayloadSchema,
  redactGenerationWebhookText,
} from '../../src/api-types/contracts/generation-webhook-events.contract';

const completedPayload = {
  event: 'generation.completed',
  eventId: 'generation:generation.completed:image:ingredient_123:completed',
  generation: {
    brandId: 'brand_123',
    completedAt: '2026-07-07T10:00:00.000Z',
    error: null,
    id: 'ingredient_123',
    kind: 'image',
    model: 'genfeedai/flux-dev',
    output: {
      mimeType: 'image/png',
      storageKey: 'ingredients/images/ingredient_123',
      url: 'https://cdn.genfeed.ai/ingredients/images/ingredient_123.png',
    },
    provider: 'genfeedai',
    status: 'completed',
  },
  occurredAt: '2026-07-07T10:00:00.000Z',
  schemaVersion: GENERATION_WEBHOOK_SCHEMA_VERSION,
  timestamp: '2026-07-07T10:00:00.000Z',
};

describe('generationWebhookPayloadSchema', () => {
  test.each(GENERATION_WEBHOOK_KINDS)(
    'accepts a versioned completed payload for %s',
    (kind) => {
      const result = generationWebhookPayloadSchema.safeParse({
        ...completedPayload,
        eventId: `generation:generation.completed:${kind}:ingredient_123:completed`,
        generation: { ...completedPayload.generation, kind },
      });

      expect(result.success).toBe(true);
    },
  );

  test('rejects a completed payload carrying a failed generation status', () => {
    const result = generationWebhookPayloadSchema.safeParse({
      ...completedPayload,
      generation: { ...completedPayload.generation, status: 'failed' },
    });

    expect(result.success).toBe(false);
  });

  test('requires an error on failure payloads', () => {
    const result = generationWebhookPayloadSchema.safeParse({
      ...completedPayload,
      event: 'generation.failed',
      eventId: 'generation:generation.failed:image:ingredient_123:failed',
      generation: {
        ...completedPayload.generation,
        error: null,
        output: null,
        status: 'failed',
      },
    });

    expect(result.success).toBe(false);
  });

  test('rejects an unknown generation kind', () => {
    const result = generationWebhookPayloadSchema.safeParse({
      ...completedPayload,
      generation: { ...completedPayload.generation, kind: 'audio' },
    });

    expect(result.success).toBe(false);
  });

  test('accepts a classified generation failure payload snapshot', () => {
    const result = generationWebhookPayloadSchema.safeParse({
      event: 'generation.failed',
      eventId: 'generation:generation.failed:video:ingredient_123:failed',
      generation: {
        brandId: 'brand_123',
        completedAt: '2026-07-07T10:00:00.000Z',
        error: {
          class: 'provider_outage',
          code: 'provider_503',
          message: 'Provider timeout 503',
          retryable: true,
        },
        id: 'ingredient_123',
        kind: 'video',
        model: 'klingai/v2',
        output: null,
        provider: 'klingai',
        status: 'failed',
      },
      occurredAt: '2026-07-07T10:00:00.000Z',
      schemaVersion: GENERATION_WEBHOOK_SCHEMA_VERSION,
      timestamp: '2026-07-07T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected generation failure payload to parse');
    }
    expect(result.data).toMatchInlineSnapshot(`
      {
        "event": "generation.failed",
        "eventId": "generation:generation.failed:video:ingredient_123:failed",
        "generation": {
          "brandId": "brand_123",
          "completedAt": "2026-07-07T10:00:00.000Z",
          "error": {
            "class": "provider_outage",
            "code": "provider_503",
            "message": "Provider timeout 503",
            "retryable": true,
          },
          "id": "ingredient_123",
          "kind": "video",
          "model": "klingai/v2",
          "output": null,
          "provider": "klingai",
          "status": "failed",
        },
        "occurredAt": "2026-07-07T10:00:00.000Z",
        "schemaVersion": 1,
        "timestamp": "2026-07-07T10:00:00.000Z",
      }
    `);
  });
});

describe('generation webhook helpers', () => {
  test.each(GENERATION_WEBHOOK_KINDS)(
    'builds a schema-valid sample payload for %s',
    (kind) => {
      const payload = createSampleGenerationWebhookPayload({
        event: 'generation.failed',
        generationId: 'generation_test',
        kind,
        occurredAt: '2026-07-07T10:00:00.000Z',
      });

      expect(payload.generation.kind).toBe(kind);
      expect(payload.generation.error).not.toBeNull();
      expect(generationWebhookPayloadSchema.safeParse(payload).success).toBe(
        true,
      );
    },
  );

  test('creates deterministic event ids per kind and outcome', () => {
    expect(
      createGenerationWebhookEventId({
        event: 'generation.completed',
        generationId: 'Ingredient 123',
        kind: 'image',
        status: 'completed',
      }),
    ).toBe('generation:generation.completed:image:ingredient-123:completed');

    expect(
      createGenerationWebhookEventId({
        event: 'generation.failed',
        generationId: 'Ingredient 123',
        kind: 'video',
        status: 'failed',
      }),
    ).toBe('generation:generation.failed:video:ingredient-123:failed');
  });

  test.each([
    ['missing model configuration', 'misconfiguration'],
    ['provider credential token expired', 'credential'],
    ['provider timeout with 503', 'provider_outage'],
    ['quota exceeded', 'rate_limit'],
    ['unsupported aspect ratio', 'validation'],
    ['unexpected generation failure', 'unknown'],
  ] as const)('classifies "%s" as %s', (message, expectedErrorClass) => {
    expect(classifyGenerationWebhookError(message)).toBe(expectedErrorClass);
  });

  test('redacts secret-like text from generation error messages', () => {
    expect(
      redactGenerationWebhookText(
        'Provider rejected api_key=abc123 and Bearer xyz987',
      ),
    ).toBe('Provider rejected api_key=[REDACTED] and Bearer [REDACTED]');
  });
});
