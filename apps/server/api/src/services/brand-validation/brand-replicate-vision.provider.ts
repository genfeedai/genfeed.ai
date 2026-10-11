import { createHash } from 'node:crypto';
import type {
  BrandDetectedRegion,
  BrandDetectionRequest,
  BrandOcrRequest,
  BrandVisionModelIdentity,
  BrandVisionProvider,
  BrandVisionProviderDetectionResult,
  BrandVisionProviderOcrResult,
} from '@api/services/brand-validation/brand-visual-analysis.types';
import { resolvePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import type { Prediction } from 'replicate';

/** Replicate L40S GPU, USD per second of runtime, used until `BRAND_VISION_USD_PER_SECOND` says otherwise. */
export const BRAND_VISION_DEFAULT_USD_PER_SECOND = 0.000975;
const POLL_INTERVAL_MS = 1_000;
const MAX_POLLS = 60;
const CACHE_LIMIT = 256;
const OCR_TASK = 'OCR';
const OCR_COST_CATEGORY = 'brand-validation-ocr';
const DETECT_COST_CATEGORY = 'brand-validation-vision';
/** Lowest confidence asked of the detector; callers apply their own, higher bar. */
const DETECT_QUERY_THRESHOLD = 0.1;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Pulls the text out of an OCR answer. Models of this class answer either the
 * text, an object holding it, or a task-keyed dict printed as a string
 * (`{'<OCR>': '...'}`). Anything else is not an answer.
 */
export function readBrandOcrText(output: unknown): string | null {
  if (typeof output === 'string') {
    const wrapped =
      /^\s*\{\s*(['"])<OCR>\1\s*:\s*(['"])([\s\S]*)\2\s*,?\s*\}\s*$/.exec(
        output,
      );
    return wrapped ? wrapped[3] : output;
  }
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const record = output as Record<string, unknown>;
    if (typeof record.text === 'string') return readBrandOcrText(record.text);
    if (typeof record['<OCR>'] === 'string') return record['<OCR>'];
  }
  return null;
}

const BOX_KEYS = ['bbox', 'box', 'bounding_box', 'xyxy'];
const SCORE_KEYS = ['score', 'confidence', 'probability'];

interface VisionRead<T> {
  identity: BrandVisionModelIdentity;
  value: T;
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}
function readBox(record: Record<string, unknown>): number[] | null {
  for (const key of BOX_KEYS) {
    const value = record[key];
    if (
      Array.isArray(value) &&
      value.length === 4 &&
      value.every(
        (entry) => typeof entry === 'number' && Number.isFinite(entry),
      )
    )
      return value;
  }
  return null;
}
function collectRegions(
  node: unknown,
  size: { width: number; height: number },
  found: BrandDetectedRegion[],
  depth = 0,
): void {
  if (depth > 6 || found.length > 256) return;
  if (Array.isArray(node)) {
    for (const entry of node) collectRegions(entry, size, found, depth + 1);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  const box = readBox(record);
  const score = readNumber(record, SCORE_KEYS);
  if (box && score !== null && score >= 0 && score <= 1) {
    // Corner coordinates, either fractions of the frame or pixels.
    const isFractional = box.every((value) => value >= 0 && value <= 1.0001);
    const [x1, y1, x2, y2] = isFractional
      ? box
      : [
          box[0] / size.width,
          box[1] / size.height,
          box[2] / size.width,
          box[3] / size.height,
        ];
    const x = Math.max(0, Math.min(1, x1));
    const y = Math.max(0, Math.min(1, y1));
    const width = Math.max(0, Math.min(1, x2)) - x;
    const height = Math.max(0, Math.min(1, y2)) - y;
    if (width > 0 && height > 0)
      found.push({ box: { height, width, x, y }, score });
    return;
  }
  for (const value of Object.values(record))
    collectRegions(value, size, found, depth + 1);
}

/** The width and height in a PNG header, or null when the bytes are not a PNG. */
export function readBrandPngSize(
  png: Uint8Array,
): { width: number; height: number } | null {
  if (png.length < 24 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47)
    return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { height, width } : null;
}

/**
 * Pulls detected regions out of an open-vocabulary detector's answer: a JSON
 * string or object holding boxes with a confidence. Anything else is not an
 * answer; an answer with no boxes is an empty list.
 */
export function readBrandDetections(
  output: unknown,
  size: { width: number; height: number },
): BrandDetectedRegion[] | null {
  let parsed = output;
  if (typeof output === 'string') {
    try {
      parsed = JSON.parse(output);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const found: BrandDetectedRegion[] = [];
  collectRegions(parsed, size, found);
  return found.sort((a, b) => b.score - a.score);
}

/** Splits `owner/name:version` into the slug recorded in the ledger. */
function modelSlug(identifier: string): string {
  const separator = identifier.lastIndexOf(':');
  return separator > 0 ? identifier.slice(0, separator) : identifier;
}

/**
 * OCR through an open-vocabulary vision model on Replicate (Florence-2 class).
 * Every prediction is recorded in the media vendor-cost ledger, priced from the
 * runtime the provider reports. Frames already read in this process are not
 * paid for again.
 */
@Injectable()
export class BrandReplicateVisionProvider implements BrandVisionProvider {
  private readonly constructorName = String(this.constructor.name);
  private readonly reads = new Map<string, Promise<VisionRead<string>>>();
  private readonly detections = new Map<
    string,
    Promise<VisionRead<BrandDetectedRegion[]>>
  >();

  constructor(
    private readonly replicate: ReplicateService,
    private readonly configService: ConfigService,
    private readonly costLedger: MediaVendorCostLedgerService,
    private readonly logger: LoggerService,
  ) {}

  async extractText(
    request: BrandOcrRequest,
  ): Promise<BrandVisionProviderOcrResult> {
    const model = this.configService.get('BRAND_VISION_REPLICATE_MODEL');
    if (!model) throw new Error('brand_vision_model_unconfigured');
    const texts: string[] = [];
    let identity: BrandVisionModelIdentity | null = null;
    for (const frame of request.frames) {
      const read = await this.cached(
        this.reads,
        `ocr:${model}`,
        frame,
        request.scope,
        () =>
          this.predict(
            model,
            frame,
            request.scope,
            OCR_COST_CATEGORY,
            { task_input: OCR_TASK },
            (output) => readBrandOcrText(output),
          ),
      );
      identity = read.identity;
      texts.push(read.value);
    }
    if (!identity) throw new Error('brand_vision_no_frames');
    return { provider: identity, texts };
  }

  async detectRegions(
    request: BrandDetectionRequest,
  ): Promise<BrandVisionProviderDetectionResult> {
    const model = this.configService.get('BRAND_VISION_DETECT_REPLICATE_MODEL');
    if (!model) throw new Error('brand_vision_model_unconfigured');
    const frames: BrandDetectedRegion[][] = [];
    let identity: BrandVisionModelIdentity | null = null;
    for (const frame of request.frames) {
      const size = readBrandPngSize(frame);
      if (!size) throw new Error('brand_vision_frame_unreadable');
      const read = await this.cached(
        this.detections,
        `detect:${model}:${request.query}`,
        frame,
        request.scope,
        () =>
          this.predict(
            model,
            frame,
            request.scope,
            DETECT_COST_CATEGORY,
            {
              query: request.query,
              show_visualisation: false,
              threshold: DETECT_QUERY_THRESHOLD,
            },
            (output) => readBrandDetections(output, size),
          ),
      );
      identity = read.identity;
      frames.push(read.value);
    }
    if (!identity) throw new Error('brand_vision_no_frames');
    return { frames, provider: identity };
  }

  /** One paid read per distinct frame, task and organization; failures are not remembered. */
  private cached<T>(
    reads: Map<string, Promise<VisionRead<T>>>,
    task: string,
    frame: Uint8Array,
    scope: BrandOcrRequest['scope'],
    make: () => Promise<VisionRead<T>>,
  ): Promise<VisionRead<T>> {
    const key = `${task}:${scope.organizationId}:${createHash('sha256').update(frame).digest('hex')}`;
    const cached = reads.get(key);
    if (cached) return cached;
    const read = make();
    reads.set(key, read);
    if (reads.size > CACHE_LIMIT) {
      const oldest = reads.keys().next().value;
      if (oldest !== undefined) reads.delete(oldest);
    }
    read.catch(() => reads.delete(key));
    return read;
  }

  private async predict<T>(
    model: string,
    frame: Uint8Array,
    scope: BrandOcrRequest['scope'],
    category: string,
    extraInput: Record<string, unknown>,
    parse: (output: unknown) => T | null,
  ): Promise<VisionRead<T>> {
    const client = this.replicate.client;
    const image = `data:image/png;base64,${Buffer.from(frame).toString('base64')}`;
    let prediction: Prediction | null = null;
    try {
      prediction = await client.predictions.create({
        ...resolvePredictionTarget(model),
        input: { image, ...extraInput },
      });
      for (
        let polls = 0;
        !['succeeded', 'failed', 'canceled'].includes(prediction.status);
        polls++
      ) {
        if (polls >= MAX_POLLS) {
          await client.predictions.cancel(prediction.id).catch(() => null);
          throw new Error('brand_vision_timeout');
        }
        await delay(POLL_INTERVAL_MS);
        prediction = await client.predictions.get(prediction.id);
      }
      if (prediction.status !== 'succeeded')
        throw new Error(`brand_vision_${prediction.status}`);
      const value = parse(prediction.output);
      if (value === null) throw new Error('brand_vision_output_unrecognized');
      return {
        identity: {
          id: 'replicate',
          model: modelSlug(model),
          version: prediction.version,
        },
        value,
      };
    } finally {
      await this.recordSpend(model, prediction, scope, category);
    }
  }

  /**
   * Spend is recorded whether or not the answer was usable. The price is the
   * provider-reported runtime times the configured per-second rate; a prediction
   * with no reported runtime lands as unknown cost so it can be reconciled.
   */
  private async recordSpend(
    model: string,
    prediction: Prediction | null,
    scope: BrandOcrRequest['scope'],
    category: string,
  ): Promise<void> {
    if (!prediction) return;
    const rate =
      Number(this.configService.get('BRAND_VISION_USD_PER_SECOND')) ||
      BRAND_VISION_DEFAULT_USD_PER_SECOND;
    const seconds = prediction.metrics?.predict_time;
    const isPriced = typeof seconds === 'number' && Number.isFinite(seconds);
    try {
      await this.costLedger.record({
        brandId: scope.brandId,
        category,
        costEvidence: isPriced ? 'calculated' : 'unknown',
        isByok: false,
        model: modelSlug(model),
        organizationId: scope.organizationId,
        pricingSnapshot: {
          predictionId: prediction.id,
          pricingType: 'per-second',
          providerCostUsd: rate,
          status: prediction.status,
          version: prediction.version,
        },
        pricingType: 'per-second',
        provider: 'replicate',
        units: isPriced ? seconds : 0,
        vendorCostMicros: isPriced ? Math.round(seconds * rate * 1_000_000) : 0,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} cost ledger write failed: ${getErrorMessage(error)}`,
        { predictionId: prediction.id },
      );
    }
  }
}
