import { JevTypedDecisionProvider } from '@api/services/typed-decisions/providers/jev-typed-decision.provider';
import { TypedDecisionRateLimitError } from '@api/services/typed-decisions/typed-decision.errors';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: mocks.safeFetch,
}));

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
    statusText: 'MOCK',
  } as Response;
}

function createProvider() {
  const configService = {
    get: vi.fn((key: string) =>
      key === 'TYPESAFE_API_KEY' ? 'typesafe-key' : '',
    ),
  } as unknown as ConfigService;
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;

  return new JevTypedDecisionProvider(configService, logger);
}

function readRequestBody(): Record<string, unknown> {
  const [, init] = mocks.safeFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body));
}

describe('JevTypedDecisionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers a choice with the vendor confidence and a calculated charge', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        answers: {
          decision: {
            choice: 'technical',
            confidence: 0.82,
            probabilities: { billing: 0.08, sales: 0.07, technical: 0.85 },
            type: 'choice',
          },
        },
        model: 'jev-1.13',
        usage: { input_tokens: 312, output_tokens: 48 },
      }),
    );

    await expect(
      createProvider().choose({
        options: ['billing', 'sales', 'technical'] as const,
        question: 'Which queue?',
        state: { body: 'my deploy fails' },
      }),
    ).resolves.toEqual({
      confidence: 0.82,
      usage: {
        costEvidence: 'calculated',
        inputTokens: 312,
        model: 'jev-latest',
        outputTokens: 48,
        // 312 input tokens at the published input-only list price.
        vendorCostMicros: 13,
      },
      value: 'technical',
    });
  });

  it('sends a choice as the SDK shape: instructions plus a criteria map', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        answers: {
          decision: { choice: 'sales', confidence: 0.9, type: 'choice' },
        },
      }),
    );

    await createProvider().choose({
      descriptions: { sales: 'Pricing, plans and invoices' },
      options: ['sales', 'technical'] as const,
      question: 'Which queue?',
      state: { body: 'pricing question' },
    });

    const body = readRequestBody();
    expect(body).toEqual({
      model: 'jev-latest',
      questions: {
        decision: {
          criteria: {
            sales: 'Pricing, plans and invoices',
            technical: null,
          },
          instructions: 'Which queue?',
          type: 'choice',
        },
      },
      state: { body: 'pricing question' },
    });
    // Retention is an account-level term; the API has no per-request flag.
    expect(body).not.toHaveProperty('store');
    expect(body).not.toHaveProperty('zero_data_retention');
  });

  it('asks a score on the default five-level rubric and normalises the expected value', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        answers: { decision: { confidence: 0.7, score: 1.68, type: 'score' } },
      }),
    );

    await expect(
      createProvider().score({
        question: 'How urgent?',
        state: { body: 'hi' },
      }),
    ).resolves.toMatchObject({ confidence: 0.7, value: 0.42 });

    expect(readRequestBody()).toMatchObject({
      questions: {
        decision: {
          criteria: [
            'not at all',
            'slightly',
            'moderately',
            'very',
            'extremely',
          ],
          instructions: 'How urgent?',
          type: 'score',
        },
      },
    });
  });

  it('uses a caller-supplied scale and maps its top level to 1', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        answers: { decision: { confidence: 0.95, score: 2, type: 'score' } },
      }),
    );

    await expect(
      createProvider().score({
        question: 'Likelihood this needs changes?',
        scale: ['unlikely', 'possible', 'likely'],
        state: {},
      }),
    ).resolves.toMatchObject({ confidence: 0.95, value: 1 });

    expect(readRequestBody()).toMatchObject({
      questions: {
        decision: { criteria: ['unlikely', 'possible', 'likely'] },
      },
    });
  });

  it('rejects a score outside the rubric instead of clamping it', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        answers: { decision: { confidence: 0.9, score: 7, type: 'score' } },
      }),
    );

    await expect(
      createProvider().score({ question: 'How urgent?', state: {} }),
    ).resolves.toBeNull();
  });

  it('asks a noul question and derives boolean confidence from its probability', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({ answers: { decision: { noul: 0.92, type: 'noul' } } }),
    );

    await expect(
      createProvider().decide({ question: 'Is it urgent?', state: {} }),
    ).resolves.toMatchObject({ confidence: 0.92, value: true });

    expect(readRequestBody()).toMatchObject({
      questions: {
        decision: { instructions: 'Is it urgent?', type: 'noul' },
      },
    });
  });

  it('bills a response without a usage envelope as unknown, not as zero', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({ answers: { decision: { noul: 0.1, type: 'noul' } } }),
    );

    const answer = await createProvider().decide({
      question: 'Is it urgent?',
      state: {},
    });

    expect(answer?.usage).toEqual({
      inputTokens: 0,
      model: 'jev-latest',
      outputTokens: 0,
    });
    expect(answer?.value).toBe(false);
  });

  it('rejects an off-menu choice instead of coercing it', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        answers: {
          decision: { choice: 'refunds', confidence: 0.99, type: 'choice' },
        },
      }),
    );

    await expect(
      createProvider().choose({
        options: ['billing', 'technical'] as const,
        question: 'Which queue?',
        state: {},
      }),
    ).resolves.toBeNull();
  });

  it('resolves null for a malformed answer envelope', async () => {
    mocks.safeFetch.mockResolvedValue(jsonResponse({ answers: 'yes' }));

    await expect(
      createProvider().decide({ question: 'Is it spam?', state: {} }),
    ).resolves.toBeNull();
  });

  it('throws on a non-2xx response', async () => {
    mocks.safeFetch.mockResolvedValue(jsonResponse({}, 503));

    await expect(
      createProvider().decide({ question: 'Is it spam?', state: {} }),
    ).rejects.toThrow('TypeSafe System One responded with 503');
  });

  it('honours retry-after on 429 and does not retry inside the budget', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({}, 429, { 'retry-after': '30' }),
    );

    const provider = createProvider();
    const params = { question: 'Is it spam?', state: {} };

    await expect(provider.decide(params)).rejects.toBeInstanceOf(
      TypedDecisionRateLimitError,
    );
    await expect(provider.decide(params)).rejects.toMatchObject({
      retryAfterSeconds: 30,
    });
    // The cooldown is served locally: the second call never leaves the process.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses to call the vendor without a key', async () => {
    const configService = {
      get: vi.fn(() => ''),
    } as unknown as ConfigService;
    const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;

    await expect(
      new JevTypedDecisionProvider(configService, logger).decide({
        question: 'Is it spam?',
        state: {},
      }),
    ).rejects.toThrow('TYPESAFE_API_KEY is not configured');
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });
});
