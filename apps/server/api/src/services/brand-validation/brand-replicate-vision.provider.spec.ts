import {
  BRAND_VISION_DEFAULT_USD_PER_SECOND,
  BrandReplicateVisionProvider,
  readBrandOcrText,
} from '@api/services/brand-validation/brand-replicate-vision.provider';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Prediction } from 'replicate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODEL = 'acme/florence:abc123version';
const scope = { brandId: 'brand-a', organizationId: 'org-a' };
const frame = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function prediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    created_at: '2026-10-11T00:00:00Z',
    data_removed: false,
    id: 'pred-1',
    input: {},
    metrics: { predict_time: 2 },
    model: 'acme/florence',
    output: { text: "{'<OCR>': 'Example Co'}" },
    source: 'api',
    status: 'succeeded',
    urls: { cancel: 'c', get: 'g' },
    version: 'abc123version',
    ...overrides,
  };
}

function setup(config: Record<string, unknown> = {}) {
  const predictions = {
    cancel: vi.fn(async () => prediction({ status: 'canceled' })),
    create: vi.fn(async () => prediction()),
    get: vi.fn(async () => prediction()),
  };
  const ledger = { record: vi.fn(async () => undefined) };
  const logger = { warn: vi.fn() };
  const values: Record<string, unknown> = {
    BRAND_VISION_REPLICATE_MODEL: MODEL,
    ...config,
  };
  const provider = new BrandReplicateVisionProvider(
    { client: { predictions } } as unknown as ReplicateService,
    { get: (key: string) => values[key] } as unknown as ConfigService,
    ledger as unknown as MediaVendorCostLedgerService,
    logger as unknown as LoggerService,
  );
  return { ledger, logger, predictions, provider };
}

describe('readBrandOcrText', () => {
  it.each([
    ['plain text', 'Example Co', 'Example Co'],
    ['a task dict printed as text', "{'<OCR>': 'Example Co'}", 'Example Co'],
    ['a double quoted dict', '{"<OCR>": "Example Co"}', 'Example Co'],
    ['an object with text', { text: "{'<OCR>': 'Sale\nnow'}" }, 'Sale\nnow'],
    ['an object keyed by the task', { '<OCR>': 'Example Co' }, 'Example Co'],
    ['an empty read', { text: "{'<OCR>': ''}" }, ''],
  ])('reads %s', (_name, output, expected) => {
    expect(readBrandOcrText(output)).toBe(expected);
  });
  it.each([[null], [undefined], [42], [['a']], [{ other: 'x' }]])(
    'refuses %j as an answer',
    (output) => {
      expect(readBrandOcrText(output)).toBeNull();
    },
  );
});

describe('BrandReplicateVisionProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends the frame as a data URI to the pinned version and returns the identity and text', async () => {
    const { predictions, provider } = setup();
    const result = await provider.extractText({ frames: [frame], scope });
    expect(result).toEqual({
      provider: {
        id: 'replicate',
        model: 'acme/florence',
        version: 'abc123version',
      },
      texts: ['Example Co'],
    });
    expect(predictions.create).toHaveBeenCalledWith({
      input: {
        image: `data:image/png;base64,${Buffer.from(frame).toString('base64')}`,
        task_input: 'OCR',
      },
      version: 'abc123version',
    });
  });
  it('prices the prediction from its reported runtime and records it for the brand', async () => {
    const { ledger, provider } = setup({ BRAND_VISION_USD_PER_SECOND: 0.001 });
    await provider.extractText({ frames: [frame], scope });
    expect(ledger.record).toHaveBeenCalledWith({
      brandId: 'brand-a',
      category: 'brand-validation-ocr',
      costEvidence: 'calculated',
      isByok: false,
      model: 'acme/florence',
      organizationId: 'org-a',
      pricingSnapshot: {
        predictionId: 'pred-1',
        pricingType: 'per-second',
        providerCostUsd: 0.001,
        status: 'succeeded',
        version: 'abc123version',
      },
      pricingType: 'per-second',
      provider: 'replicate',
      units: 2,
      vendorCostMicros: 2000,
    });
  });
  it('falls back to the L40S rate when none is configured', async () => {
    const { ledger, provider } = setup();
    await provider.extractText({ frames: [frame], scope });
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorCostMicros: Math.round(
          2 * BRAND_VISION_DEFAULT_USD_PER_SECOND * 1_000_000,
        ),
      }),
    );
  });
  it('reads every frame in order and charges each prediction', async () => {
    const { ledger, predictions, provider } = setup();
    predictions.create
      .mockResolvedValueOnce(prediction({ id: 'p1', output: 'one' }))
      .mockResolvedValueOnce(prediction({ id: 'p2', output: 'two' }));
    const result = await provider.extractText({
      frames: [new Uint8Array([1]), new Uint8Array([2])],
      scope,
    });
    expect(result.texts).toEqual(['one', 'two']);
    expect(ledger.record).toHaveBeenCalledTimes(2);
  });
  it('polls an unfinished prediction until it succeeds', async () => {
    const { predictions, provider } = setup();
    predictions.create.mockResolvedValueOnce(
      prediction({ metrics: undefined, output: undefined, status: 'starting' }),
    );
    predictions.get
      .mockResolvedValueOnce(
        prediction({
          metrics: undefined,
          output: undefined,
          status: 'processing',
        }),
      )
      .mockResolvedValueOnce(prediction());
    const pending = provider.extractText({ frames: [frame], scope });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await pending).texts).toEqual(['Example Co']);
    expect(predictions.get).toHaveBeenCalledTimes(2);
  });
  it('does not pay twice for a frame it already read', async () => {
    const { ledger, predictions, provider } = setup();
    await provider.extractText({ frames: [frame], scope });
    await provider.extractText({ frames: [frame], scope });
    expect(predictions.create).toHaveBeenCalledTimes(1);
    expect(ledger.record).toHaveBeenCalledTimes(1);
  });
  it('does not share a read between organizations', async () => {
    const { predictions, provider } = setup();
    await provider.extractText({ frames: [frame], scope });
    await provider.extractText({
      frames: [frame],
      scope: { ...scope, organizationId: 'org-b' },
    });
    expect(predictions.create).toHaveBeenCalledTimes(2);
  });
  it('still records spend when the prediction fails, and does not cache the failure', async () => {
    const { ledger, predictions, provider } = setup();
    predictions.create.mockResolvedValueOnce(
      prediction({ output: undefined, status: 'failed' }),
    );
    await expect(
      provider.extractText({ frames: [frame], scope }),
    ).rejects.toThrow('brand_vision_failed');
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({ costEvidence: 'calculated', units: 2 }),
    );
    await expect(
      provider.extractText({ frames: [frame], scope }),
    ).resolves.toMatchObject({ texts: ['Example Co'] });
  });
  it('records an unknown cost when the provider reports no runtime', async () => {
    const { ledger, predictions, provider } = setup();
    predictions.create.mockResolvedValueOnce(
      prediction({ metrics: undefined }),
    );
    await provider.extractText({ frames: [frame], scope });
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        costEvidence: 'unknown',
        units: 0,
        vendorCostMicros: 0,
      }),
    );
  });
  it('refuses an answer it cannot read, after recording the spend', async () => {
    const { ledger, predictions, provider } = setup();
    predictions.create.mockResolvedValueOnce(
      prediction({ output: { other: 1 } }),
    );
    await expect(
      provider.extractText({ frames: [frame], scope }),
    ).rejects.toThrow('brand_vision_output_unrecognized');
    expect(ledger.record).toHaveBeenCalledTimes(1);
  });
  it('cancels a prediction that never finishes', async () => {
    const { predictions, provider } = setup();
    const unfinished = prediction({
      metrics: undefined,
      output: undefined,
      status: 'processing',
    });
    predictions.create.mockResolvedValueOnce(unfinished);
    predictions.get.mockResolvedValue(unfinished);
    const pending = provider.extractText({ frames: [frame], scope });
    const settled = expect(pending).rejects.toThrow('brand_vision_timeout');
    await vi.advanceTimersByTimeAsync(61_000);
    await settled;
    expect(predictions.cancel).toHaveBeenCalledWith('pred-1');
  });
  it('fails closed without a configured model and calls nothing', async () => {
    const { ledger, predictions, provider } = setup({
      BRAND_VISION_REPLICATE_MODEL: '',
    });
    await expect(
      provider.extractText({ frames: [frame], scope }),
    ).rejects.toThrow('brand_vision_model_unconfigured');
    expect(predictions.create).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });
  it('does not fail the read when the ledger write fails', async () => {
    const { ledger, logger, provider } = setup();
    ledger.record.mockRejectedValueOnce(new Error('db down'));
    await expect(
      provider.extractText({ frames: [frame], scope }),
    ).resolves.toMatchObject({ texts: ['Example Co'] });
    expect(logger.warn).toHaveBeenCalled();
  });
});
