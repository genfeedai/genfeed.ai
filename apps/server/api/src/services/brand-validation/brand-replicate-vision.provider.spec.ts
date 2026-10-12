import { readFile } from 'node:fs/promises';
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
  BRAND_VISION_DETECT_MODEL_KEY,
  BRAND_VISION_MODELS,
  BRAND_VISION_OCR_MODEL_KEY,
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
    // Florence-2 prints a Python repr: line breaks and quotes arrive escaped.
    [
      'the live Florence-2 answer with its escaped line break',
      { img: null, text: "{'<OCR>': 'GENFEED SALE\\n'}" },
      'GENFEED SALE\n',
    ],
    [
      'escaped line breaks between lines',
      "{'<OCR>': 'GENFEED\\nSALE\\r\\n50%\\tOFF'}",
      'GENFEED\nSALE\r\n50%\tOFF',
    ],
    [
      'an escaped quote and backslash',
      "{'<OCR>': 'It\\'s a \\\\ sale'}",
      "It's a \\ sale",
    ],
    [
      'a double quoted repr holding an apostrophe',
      "{'<OCR>': \"It's on sale\"}",
      "It's on sale",
    ],
    [
      'hex and unicode escapes',
      "{'<OCR>': 'caf\\xe9 \\u2713 \\U0001f600'}",
      'café ✓ \u{1f600}',
    ],
    [
      'an escape that names no code point, left as written',
      "{'<OCR>': 'a\\U00110000b \\q'}",
      'a\\U00110000b \\q',
    ],
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

// Shapes recorded against Replicate on 2026-10-12 (#6727, lane Z). The schema
// files are the pinned versions' own openapi_schema; the OCR answer is one live
// prediction; the detector answer is the model owner's published example for the
// pinned version (our live detector prediction timed out in a cold start).
const readFixture = async <T>(file: string): Promise<T> =>
  JSON.parse(
    await readFile(
      new URL(`./fixtures/replicate-vision/${file}`, import.meta.url),
      'utf8',
    ),
  ) as T;

interface JsonSchemaProperty {
  enum?: string[];
  maximum?: number;
  minimum?: number;
  type: string;
}
interface PinnedSchema {
  Input: {
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  Output: { properties: Record<string, unknown>; required?: string[] };
  version: string;
}
interface LiveOcrRecording {
  ledger: { units: number; vendorCostMicros: number };
  metrics: { predict_time: number };
  output: { img: string | null; text: string };
  version: string;
}
interface PublishedDetectionExample {
  input: Record<string, unknown>;
  output: { json_data: { objects: unknown[] } };
  version: string;
}

function catalogRowFor(key: string): CatalogRow {
  const model = BRAND_VISION_MODELS.find((entry) => entry.key === key);
  if (!model) throw new Error(`no catalog model ${key}`);
  return catalogRow({
    capabilities: [model.capability],
    externalId: model.externalId,
    key: model.key,
    label: model.label,
    providerCostUsd: model.providerCostUsd,
  });
}

describe('Replicate vision models as verified against the live API', () => {
  const realRows = [
    catalogRowFor(BRAND_VISION_OCR_MODEL_KEY),
    catalogRowFor(BRAND_VISION_DETECT_MODEL_KEY),
  ];
  const realSettings = {
    brandVisionDetectModelKey: BRAND_VISION_DETECT_MODEL_KEY,
    brandVisionOcrModelKey: BRAND_VISION_OCR_MODEL_KEY,
  };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['florence-2-large.schema.json', BRAND_VISION_OCR_MODEL_KEY],
    ['owlvit-base-patch32.schema.json', BRAND_VISION_DETECT_MODEL_KEY],
  ])('pins the schema %s to the catalog version', async (file, key) => {
    const schema = await readFixture<PinnedSchema>(file);
    const model = BRAND_VISION_MODELS.find((entry) => entry.key === key);
    expect(model?.externalId.endsWith(`:${schema.version}`)).toBe(true);
  });

  it('sends Florence-2 only inputs its schema defines, with the required image and an enum task', async () => {
    const schema = await readFixture<PinnedSchema>(
      'florence-2-large.schema.json',
    );
    const { predictions, provider } = setup({
      rows: realRows,
      settings: realSettings,
    });
    await provider.extractText({ frames: [frame], scope });
    const sent = (
      predictions.create.mock.calls[0] as unknown as [
        { input: Record<string, unknown> },
      ]
    )[0].input;
    for (const name of Object.keys(sent))
      expect(schema.Input.properties).toHaveProperty(name);
    for (const name of schema.Input.required ?? [])
      expect(sent).toHaveProperty(name);
    expect(schema.Input.properties.task_input?.enum).toContain(sent.task_input);
    expect(schema.Output.required).toEqual(['text']);
  });

  it('sends OWL-ViT only inputs its schema defines, inside their bounds', async () => {
    const schema = await readFixture<PinnedSchema>(
      'owlvit-base-patch32.schema.json',
    );
    const { predictions, provider } = setup({
      rows: realRows,
      settings: realSettings,
    });
    predictions.create.mockResolvedValueOnce(
      prediction({ output: { json_data: { objects: [] } } }),
    );
    await provider.detectRegions({
      frames: [await png(60, 40)],
      query: 'logo',
      scope,
    });
    const sent = (
      predictions.create.mock.calls[0] as unknown as [
        { input: Record<string, unknown> },
      ]
    )[0].input;
    for (const name of Object.keys(sent))
      expect(schema.Input.properties).toHaveProperty(name);
    for (const name of schema.Input.required ?? [])
      expect(sent).toHaveProperty(name);
    expect(schema.Input.properties.query?.type).toBe('string');
    expect(schema.Input.properties.show_visualisation?.type).toBe('boolean');
    const threshold = schema.Input.properties.threshold;
    expect(sent.threshold).toBeGreaterThanOrEqual(threshold?.minimum ?? 0);
    expect(sent.threshold).toBeLessThanOrEqual(threshold?.maximum ?? 1);
    expect(schema.Output.required).toEqual(['json_data']);
  });

  it('reads the live Florence-2 answer to the exact text and prices it from the reported runtime', async () => {
    const recording = await readFixture<LiveOcrRecording>(
      'florence-2-large.ocr.live.json',
    );
    const { ledger, predictions, provider } = setup({
      rows: realRows,
      settings: realSettings,
    });
    predictions.create.mockResolvedValueOnce(
      prediction({
        metrics: recording.metrics,
        output: recording.output,
        version: recording.version,
      }),
    );
    const result = await provider.extractText({ frames: [frame], scope });
    expect(result.texts).toEqual(['GENFEED SALE\n']);
    expect(result.provider).toEqual({
      id: 'replicate',
      model: BRAND_VISION_OCR_MODEL_KEY,
      version: recording.version,
    });
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        costEvidence: 'calculated',
        units: recording.ledger.units,
        vendorCostMicros: recording.ledger.vendorCostMicros,
      }),
    );
  });

  it("reads OWL-ViT's published example into fractional regions, best first", async () => {
    const example = await readFixture<PublishedDetectionExample>(
      'owlvit-base-patch32.default-example.json',
    );
    // The example's pixel boxes fit this frame; one box reaches y = -1.
    const regions = readBrandDetections(example.output, {
      height: 509,
      width: 512,
    });
    expect(regions).toHaveLength(example.output.json_data.objects.length);
    expect(regions?.map((region) => region.score)).toEqual(
      [...(regions ?? [])].map((region) => region.score).sort((a, b) => b - a),
    );
    for (const region of regions ?? []) {
      expect(region.box.x).toBeGreaterThanOrEqual(0);
      expect(region.box.y).toBeGreaterThanOrEqual(0);
      expect(region.box.x + region.box.width).toBeLessThanOrEqual(1);
      expect(region.box.y + region.box.height).toBeLessThanOrEqual(1);
    }
    expect(regions?.[0]?.score).toBeCloseTo(0.357136, 5);
    expect(regions?.[0]?.box.x).toBeCloseTo(180 / 512, 6);
  });
});
