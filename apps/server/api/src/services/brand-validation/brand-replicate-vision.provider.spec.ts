import { BrandVisionModelCatalogService } from '@api/collections/platform-settings/services/brand-vision-model-catalog.service';
import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import {
  BrandReplicateVisionProvider,
  readBrandDetections,
  readBrandOcrText,
  readBrandPngSize,
} from '@api/services/brand-validation/brand-replicate-vision.provider';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import {
  BRAND_DETECTION_CAPABILITY,
  BRAND_OCR_CAPABILITY,
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
} from '@genfeedai/contracts/constants';
import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Prediction } from 'replicate';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OCR_KEY = 'acme/florence';
const DETECT_KEY = 'acme/owl';
/** What the catalog rows say; the provider must use these and nothing else. */
const OCR_RATE = 0.001;
const DETECT_RATE = 0.0004;
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

interface CatalogRow {
  capabilities: string[];
  externalId: string | null;
  isActive: boolean;
  key: string;
  label: string;
  pricingType: string | null;
  providerCostUsd: number | null;
}

function catalogRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    capabilities: [BRAND_OCR_CAPABILITY],
    externalId: `${OCR_KEY}:abc123version`,
    isActive: true,
    key: OCR_KEY,
    label: 'Florence',
    pricingType: 'per-second',
    providerCostUsd: OCR_RATE,
    ...overrides,
  };
}

const DETECT_ROW = catalogRow({
  capabilities: [BRAND_DETECTION_CAPABILITY],
  externalId: `${DETECT_KEY}:def456version`,
  key: DETECT_KEY,
  label: 'Owl',
  providerCostUsd: DETECT_RATE,
});

interface SetupOptions {
  rows?: CatalogRow[];
  settings?: Partial<IPlatformFeatureSettings>;
}

function setup({ rows, settings = {} }: SetupOptions = {}) {
  const predictions = {
    cancel: vi.fn(async () => prediction({ status: 'canceled' })),
    create: vi.fn(async () => prediction()),
    get: vi.fn(async () => prediction()),
  };
  const ledger = { record: vi.fn(async () => undefined) };
  const logger = { warn: vi.fn() };
  const catalogRows = rows ?? [catalogRow(), DETECT_ROW];
  // A fake of the one Prisma query the catalog service makes: an active,
  // platform-owned Replicate row with this key and capability.
  const prisma = {
    model: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            capabilities: { has: string };
            isActive: boolean;
            key: string;
            organizationId: null;
            provider: string;
          };
        }) =>
          catalogRows.find(
            (row) =>
              row.key === where.key &&
              row.isActive === where.isActive &&
              row.capabilities.includes(where.capabilities.has),
          ) ?? null,
      ),
    },
  };
  const platformSettings = {
    getFeatureSettings: vi.fn(async () => ({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      brandVisionDetectModelKey: DETECT_KEY,
      brandVisionOcrModelKey: OCR_KEY,
      ...settings,
    })),
  };
  const provider = new BrandReplicateVisionProvider(
    { client: { predictions } } as unknown as ReplicateService,
    platformSettings as unknown as PlatformSettingsService,
    new BrandVisionModelCatalogService(prisma as never),
    ledger as unknown as MediaVendorCostLedgerService,
    logger as unknown as LoggerService,
  );
  return { ledger, logger, platformSettings, predictions, prisma, provider };
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
  it('prices the prediction from its reported runtime at the selected catalog model price and records it for the brand', async () => {
    const { ledger, provider } = setup();
    await provider.extractText({ frames: [frame], scope });
    expect(ledger.record).toHaveBeenCalledWith({
      brandId: 'brand-a',
      category: 'brand-validation-ocr',
      costEvidence: 'calculated',
      isByok: false,
      model: 'acme/florence',
      organizationId: 'org-a',
      pricingSnapshot: {
        modelKey: OCR_KEY,
        predictionId: 'pred-1',
        pricingType: 'per-second',
        providerCostUsd: OCR_RATE,
        status: 'succeeded',
        version: 'abc123version',
      },
      pricingType: 'per-second',
      provider: 'replicate',
      units: 2,
      vendorCostMicros: 2000,
    });
  });
  it('follows the catalog: another selected model runs its version at its own price', async () => {
    const other = catalogRow({
      externalId: 'acme/other-ocr:fedcba987',
      key: 'acme/other-ocr',
      providerCostUsd: 0.01,
    });
    const { ledger, predictions, provider } = setup({
      rows: [catalogRow(), other],
      settings: { brandVisionOcrModelKey: 'acme/other-ocr' },
    });
    const result = await provider.extractText({ frames: [frame], scope });
    expect(predictions.create).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'fedcba987' }),
    );
    expect(result.provider.model).toBe('acme/other-ocr');
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'acme/other-ocr',
        vendorCostMicros: 20_000,
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
  it.each([
    ['no model is selected', { settings: { brandVisionOcrModelKey: null } }],
    [
      'the selected key is not in the catalog',
      { settings: { brandVisionOcrModelKey: 'acme/unknown' } },
    ],
    [
      'the selected model is inactive',
      { rows: [catalogRow({ isActive: false })] },
    ],
    [
      'the selected model lacks the OCR capability',
      { rows: [catalogRow({ capabilities: [BRAND_DETECTION_CAPABILITY] })] },
    ],
    [
      'the selected model names no version',
      { rows: [catalogRow({ externalId: null })] },
    ],
    [
      'the selected model is not pinned to a version',
      { rows: [catalogRow({ externalId: OCR_KEY })] },
    ],
    [
      'the selected model is not priced per second',
      { rows: [catalogRow({ pricingType: 'flat' })] },
    ],
    [
      'the selected model has no price',
      { rows: [catalogRow({ providerCostUsd: null })] },
    ],
    [
      'the selected model has a zero price',
      { rows: [catalogRow({ providerCostUsd: 0 })] },
    ],
  ] satisfies Array<[string, SetupOptions]>)(
    'fails closed and calls nothing when %s',
    async (_name, options) => {
      const { ledger, predictions, provider } = setup(options);
      await expect(
        provider.extractText({ frames: [frame], scope }),
      ).rejects.toThrow('brand_vision_model_unconfigured');
      expect(predictions.create).not.toHaveBeenCalled();
      expect(ledger.record).not.toHaveBeenCalled();
    },
  );
  it('has no environment fallback: a missing selection stays unavailable', async () => {
    const { platformSettings, provider } = setup({
      settings: { brandVisionOcrModelKey: null },
    });
    await expect(
      provider.extractText({ frames: [frame], scope }),
    ).rejects.toThrow('brand_vision_model_unconfigured');
    expect(platformSettings.getFeatureSettings).toHaveBeenCalledTimes(1);
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

async function png(width: number, height: number) {
  return new Uint8Array(
    await sharp({
      create: { background: '#ffffff', channels: 3, height, width },
    })
      .png()
      .toBuffer(),
  );
}
const size = { height: 400, width: 600 };

describe('readBrandPngSize', () => {
  it('reads the dimensions from the header', async () => {
    expect(readBrandPngSize(await png(600, 400))).toEqual(size);
  });
  it('refuses bytes that are not a PNG', () => {
    expect(readBrandPngSize(new Uint8Array(40))).toBeNull();
    expect(readBrandPngSize(new Uint8Array(3))).toBeNull();
  });
});

describe('readBrandDetections', () => {
  it('reads pixel corner boxes into fractions of the frame, best first', () => {
    const regions = readBrandDetections(
      {
        json_data: {
          objects: [
            { bbox: [60, 40, 180, 120], category: 'logo', score: 0.4 },
            { bbox: [300, 200, 600, 400], category: 'logo', score: 0.9 },
          ],
        },
      },
      size,
    );
    expect(regions).toHaveLength(2);
    expect(regions?.[0]?.score).toBe(0.9);
    expect(regions?.[0]?.box.x).toBeCloseTo(0.5, 6);
    expect(regions?.[0]?.box.y).toBeCloseTo(0.5, 6);
    expect(regions?.[0]?.box.width).toBeCloseTo(0.5, 6);
    expect(regions?.[0]?.box.height).toBeCloseTo(0.5, 6);
    expect(regions?.[1]?.score).toBe(0.4);
    expect(regions?.[1]?.box.width).toBeCloseTo(0.2, 6);
  });
  it('accepts fractional boxes and a JSON string', () => {
    const regions = readBrandDetections(
      JSON.stringify([{ box: [0.1, 0.2, 0.5, 0.6], confidence: 0.7 }]),
      size,
    );
    expect(regions?.[0]?.box.x).toBeCloseTo(0.1, 6);
    expect(regions?.[0]?.box.width).toBeCloseTo(0.4, 6);
  });
  it('treats an answer with no boxes as an empty list, and anything else as no answer', () => {
    expect(readBrandDetections({ json_data: { objects: [] } }, size)).toEqual(
      [],
    );
    expect(readBrandDetections('not json', size)).toBeNull();
    expect(readBrandDetections(42, size)).toBeNull();
    expect(readBrandDetections(null, size)).toBeNull();
  });
  it('drops boxes with no confidence, an empty box or a confidence outside 0..1', () => {
    expect(
      readBrandDetections(
        [
          { bbox: [1, 2, 30, 40] },
          { bbox: [10, 10, 10, 50], score: 0.9 },
          { bbox: [0, 0, 10, 10], score: 3 },
        ],
        size,
      ),
    ).toEqual([]);
  });
});

describe('BrandReplicateVisionProvider detection', () => {
  const scope = { brandId: 'brand-a', organizationId: 'org-a' };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks the pinned detector for the query and returns regions with the identity', async () => {
    const { predictions, provider } = setup();
    predictions.create.mockResolvedValueOnce(
      prediction({
        output: {
          json_data: {
            objects: [{ bbox: [0, 0, 300, 200], score: 0.8 }],
          },
        },
        version: 'def456version',
      }),
    );
    const frame = await png(600, 400);
    const result = await provider.detectRegions({
      frames: [frame],
      query: 'logo',
      scope,
    });
    expect(result).toEqual({
      frames: [[{ box: { height: 0.5, width: 0.5, x: 0, y: 0 }, score: 0.8 }]],
      provider: {
        id: 'replicate',
        model: 'acme/owl',
        version: 'def456version',
      },
    });
    expect(predictions.create).toHaveBeenCalledWith({
      input: {
        image: `data:image/png;base64,${Buffer.from(frame).toString('base64')}`,
        query: 'logo',
        show_visualisation: false,
        threshold: 0.1,
      },
      version: 'def456version',
    });
  });
  it('records the spend under the vision category and shares no read between queries', async () => {
    const { ledger, predictions, provider } = setup();
    predictions.create.mockImplementation(async () =>
      prediction({ output: { objects: [] } }),
    );
    const frame = await png(600, 400);
    await provider.detectRegions({ frames: [frame], query: 'logo', scope });
    await provider.detectRegions({ frames: [frame], query: 'logo', scope });
    await provider.detectRegions({ frames: [frame], query: 'product', scope });
    expect(predictions.create).toHaveBeenCalledTimes(2);
    expect(ledger.record).toHaveBeenCalledTimes(2);
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'brand-validation-vision',
        model: 'acme/owl',
        vendorCostMicros: Math.round(2 * DETECT_RATE * 1_000_000),
      }),
    );
  });
  it('fails closed without a detector model, on an unreadable frame or an unreadable answer', async () => {
    const unconfigured = setup({
      settings: { brandVisionDetectModelKey: null },
    });
    await expect(
      unconfigured.provider.detectRegions({
        frames: [await png(60, 40)],
        query: 'logo',
        scope,
      }),
    ).rejects.toThrow('brand_vision_model_unconfigured');
    expect(unconfigured.predictions.create).not.toHaveBeenCalled();
    const { ledger, predictions, provider } = setup();
    await expect(
      provider.detectRegions({
        frames: [new Uint8Array([1, 2, 3])],
        query: 'logo',
        scope,
      }),
    ).rejects.toThrow('brand_vision_frame_unreadable');
    expect(predictions.create).not.toHaveBeenCalled();
    predictions.create.mockResolvedValueOnce(prediction({ output: 'oops' }));
    await expect(
      provider.detectRegions({
        frames: [await png(60, 40)],
        query: 'logo',
        scope,
      }),
    ).rejects.toThrow('brand_vision_output_unrecognized');
    expect(ledger.record).toHaveBeenCalledTimes(1);
  });
});
