import { createHash } from 'node:crypto';
import type {
  BrandOcrRequest,
  BrandVisionModelIdentity,
  BrandVisionProvider,
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
  private readonly reads = new Map<
    string,
    Promise<{ identity: BrandVisionModelIdentity; text: string }>
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
      const read = await this.readFrame(model, frame, request.scope);
      identity = read.identity;
      texts.push(read.text);
    }
    if (!identity) throw new Error('brand_vision_no_frames');
    return { provider: identity, texts };
  }

  private readFrame(
    model: string,
    frame: Uint8Array,
    scope: BrandOcrRequest['scope'],
  ) {
    const key = `${model}:${scope.organizationId}:${createHash('sha256').update(frame).digest('hex')}`;
    const cached = this.reads.get(key);
    if (cached) return cached;
    const read = this.predict(model, frame, scope);
    this.reads.set(key, read);
    if (this.reads.size > CACHE_LIMIT) {
      const oldest = this.reads.keys().next().value;
      if (oldest !== undefined) this.reads.delete(oldest);
    }
    read.catch(() => this.reads.delete(key));
    return read;
  }

  private async predict(
    model: string,
    frame: Uint8Array,
    scope: BrandOcrRequest['scope'],
  ): Promise<{ identity: BrandVisionModelIdentity; text: string }> {
    const client = this.replicate.client;
    const image = `data:image/png;base64,${Buffer.from(frame).toString('base64')}`;
    let prediction: Prediction | null = null;
    try {
      prediction = await client.predictions.create({
        ...resolvePredictionTarget(model),
        input: { image, task_input: OCR_TASK },
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
      const text = readBrandOcrText(prediction.output);
      if (text === null) throw new Error('brand_vision_output_unrecognized');
      return {
        identity: {
          id: 'replicate',
          model: modelSlug(model),
          version: prediction.version,
        },
        text,
      };
    } finally {
      await this.recordSpend(model, prediction, scope);
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
        category: OCR_COST_CATEGORY,
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
