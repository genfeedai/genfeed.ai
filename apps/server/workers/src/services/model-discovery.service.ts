import { ModelsService } from '@api/collections/models/services/models.service';
import { getProviderModelKey } from '@api/collections/models/utils/model-key.util';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import type { ServerModelRecord } from '@api/index';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import {
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import type {
  TypedDecisionAnswer,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';
import {
  extractReplicateBillingTiers,
  type ReplicateBillingObservation,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type {
  IModelCategoryDecision,
  IModelCategoryDetectionInput,
  IModelDiscoveryInput,
  IOutputSchemaCategorySignal,
  IReplicateModel,
  IReplicateVersionDetail,
  ModelCategoryDecisionSource,
} from '@workers/interfaces/model-discovery.interface';
import {
  MODEL_DISCOVERY_CATEGORY_DECISION_POINT,
  MODEL_DISCOVERY_DECISION_TIMEOUT_MS,
  resolveModelDiscoveryDecisionSettings,
} from '@workers/services/model-discovery-decision.settings';

const LABEL_SEPARATOR_PATTERN = /[-/]/;
const UPSCALE_ENDPOINT_PATTERN = /upscal/;
const EDIT_ENDPOINT_PATTERN =
  /(^|[-/])(edit|inpaint|outpaint|modify|transform)([-/.]|$)/;
const VOICE_HINT_PATTERN = /\b(speech|voice|tts|narrat\w*|speaker)\b/;
const LEADING_DIGIT_PATTERN = /^\d/;

/** Every Replicate request, the public model page (#6196) and the API, gives up after this. */
const REPLICATE_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Schema property shape from Replicate OpenAPI schema inspection.
 * Used for auto-detecting model category from input/output schema.
 */
interface ISchemaProperty {
  type?: string;
  format?: string;
  description?: string;
  title?: string;
  'x-order'?: number;
}

/**
 * Ordered keyword table: first rule whose keyword appears in the combined
 * schema + description text wins.
 *
 * ORDER IS THE CONTRACT. Every rule is a substring match, so a rule whose
 * keywords are prefixes of another rule's must come first or it can never
 * fire. #4869 fixed three rules that were dead or actively wrong:
 * - generic `video` sat above VIDEO_UPSCALE / VIDEO_EDIT and swallowed
 *   every `video upscale` and `video edit` model into plain VIDEO;
 * - IMAGE_UPSCALE's generic `enhance` sat above IMAGE_EDIT and swallowed
 *   every "edit and enhance" image model into IMAGE_UPSCALE;
 * - `clip` sat in both VIDEO and EMBEDDING with VIDEO first, so a CLIP
 *   embedding model resolved to VIDEO and EMBEDDING's copy could never fire.
 *   A bare `clip` is not a video signal either — it stole "instrumental
 *   clips" from MUSIC — and `video clip` is already covered by `video`, so
 *   the token is gone from both rules and EMBEDDING leads on distinctive
 *   spellings instead. `encode` is deliberately not among them: at the head
 *   of the table it would claim "encodes video frames into tokens".
 *
 * Add new rules specific-first, and add a spec for the pair you are ordering
 * against — a shadowed rule is invisible until someone reads the table.
 */
const CATEGORY_DETECTION_RULES: Array<{
  keywords: string[];
  category: ModelCategory;
}> = [
  {
    category: ModelCategory.EMBEDDING,
    // `clip embedding` is not listed: `embedding` already matches it, and a
    // keyword that can never fire is the bug this comment is about.
    keywords: ['embedding', 'clip-vit', 'sentence-transformer'],
  },
  {
    category: ModelCategory.VIDEO_UPSCALE,
    keywords: ['video-upscale', 'video upscale', 'video enhance'],
  },
  {
    category: ModelCategory.VIDEO_EDIT,
    keywords: ['video-edit', 'video edit', 'video transform'],
  },
  {
    category: ModelCategory.VIDEO,
    keywords: ['video', 'mp4', 'animation', 'motion'],
  },
  {
    category: ModelCategory.IMAGE_EDIT,
    keywords: ['image-edit', 'inpaint', 'outpaint', 'edit'],
  },
  {
    category: ModelCategory.IMAGE_UPSCALE,
    keywords: ['upscale', 'super-resolution', 'enhance'],
  },
  {
    category: ModelCategory.MUSIC,
    keywords: ['music', 'audio', 'sound', 'melody'],
  },
  {
    category: ModelCategory.VOICE,
    keywords: ['voice', 'speech', 'tts', 'text-to-speech'],
  },
  {
    category: ModelCategory.TEXT,
    keywords: ['text', 'language', 'chat', 'completion', 'llm', 'instruct'],
  },
  {
    category: ModelCategory.IMAGE,
    keywords: ['image', 'picture', 'photo', 'illustration', 'generate'],
  },
];

/** The closed set the typed choice decides over. */
const MODEL_CATEGORY_OPTIONS: readonly ModelCategory[] =
  Object.values(ModelCategory);

const MODEL_CATEGORY_QUESTION =
  'Which registry category does this generative model belong to?';

/** Keeps one decision's state small and bounded, whatever the provider ships. */
const MAX_STATE_TEXT_LENGTH = 600;

const MAX_STATE_SCHEMA_FIELDS = 24;

/** The result of asking a provider for one exact model. */
export type ReplicateModelFetch =
  | { model: IReplicateModel; status: 'ok' }
  /** The provider's API says the model does not exist. */
  | { status: 'not_found' }
  | { status: 'failed' };

/** Prisma's code for a write that violates a unique constraint. */
const UNIQUE_CONSTRAINT_VIOLATION_CODE = 'P2002';

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION_CODE
  );
}

/** The row's pricing type for the unit its page bills. */
function pricingTypeForUnit(unit: string | null | undefined): PricingType {
  if (unit === 'second') return PricingType.PER_SECOND;
  if (unit === 'megapixel') return PricingType.PER_MEGAPIXEL;
  return PricingType.FLAT;
}

@Injectable()
export class ModelDiscoveryService {
  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly configService: ConfigService,
    private readonly typedDecisionService: TypedDecisionService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  /**
   * The subset of `keys` that already name a registry row. `models.key` is
   * unique across every provider, organization and soft-deleted row, so a key
   * held by an OpenRouter row, a HeyGen row or a retired row blocks a draft
   * just as a live row of the discovering provider does.
   */
  async findTakenKeys(keys: readonly string[]): Promise<Set<string>> {
    if (keys.length === 0) {
      return new Set();
    }
    // tenant-scope-ignore: the registry key is globally unique, so only a lookup across every provider, tenant and soft-deleted row says whether a draft can take it
    const rows = await this.modelsService.prisma.model.findMany({
      select: { key: true },
      where: { key: { in: [...keys] } },
    });
    return new Set(rows.map((row) => row.key));
  }

  /**
   * Create a draft model entry in the database.
   * Draft models are created with isActive: false and require manual review
   * before being activated for users. A draft stores the provider's own price
   * when its page stated one, and no credits either way: credits exist only once
   * an operator approves rates read from a source.
   */
  async createDraftModel(
    modelInfo: IModelDiscoveryInput,
  ): Promise<ServerModelRecord | null> {
    const context = 'ModelDiscoveryService createDraftModel';
    const modelKey = getProviderModelKey(
      modelInfo.provider,
      modelInfo.endpoint,
    );

    try {
      // Verify model doesn't already exist (defense in depth)
      const existing = await this.modelsService.findOne({
        endpoint: modelInfo.endpoint,
        provider: modelInfo.provider,
      });

      if (existing) {
        this.logger.log(
          `${context} model already exists, skipping: ${modelKey}`,
        );
        return null;
      }

      // `models.key` is unique across providers and soft-deleted rows, so the
      // endpoint+provider lookup above misses a row another provider (or a
      // retired row) holds, and the insert would then fail on the key.
      if ((await this.findTakenKeys([modelKey])).has(modelKey)) {
        this.logger.log(
          `${context} key is already in the registry, skipping: ${modelKey}`,
        );
        return null;
      }

      // Providers that publish a display name win; the rest get a title-cased
      // model name.
      const label =
        modelInfo.label?.trim() ||
        this.buildDisplayLabel(modelInfo.owner, modelInfo.name);

      // Create draft model document with base DTO fields
      const createData = {
        category: modelInfo.category,
        cost: 0,
        description:
          modelInfo.description ||
          `Auto-discovered model from ${modelInfo.owner}. Pending manual review.`,
        endpoint: modelInfo.endpoint,
        isActive: false,
        isDefault: false,
        isDiscovered: true,
        isHighlighted: false,
        key: modelKey as string,
        label,
        margin: 0.7,
        provider: modelInfo.provider,
        providerConfig: {
          discoverySource: 'provider-sync',
          name: modelInfo.name,
          owner: modelInfo.owner,
          endpoint: modelInfo.endpoint,
          providerUrl: modelInfo.providerUrl,
          versionId: modelInfo.versionId,
          ...(modelInfo.billingUnit
            ? { billingUnit: modelInfo.billingUnit }
            : {}),
          ...(modelInfo.pricingSourceUrl
            ? { pricingSourceUrl: modelInfo.pricingSourceUrl }
            : {}),
          ...(modelInfo.unpricedReason
            ? { unpricedReason: modelInfo.unpricedReason }
            : {}),
        },
        providerCostUsd: modelInfo.providerCostUsd,
        reviewStatus: 'pending',
      };

      const draftModel = await this.modelsService.create(createData);

      // Patch with dynamic fields not in CreateModelDto but supported by schema.
      // `categoryConfidence` rides along so the admin registry review can show
      // an operator how sure the category on this pending draft is (#4869).
      const now = new Date();
      await this.modelsService.patch(draftModel.id, {
        ...(typeof modelInfo.categoryConfidence === 'number'
          ? { categoryConfidence: modelInfo.categoryConfidence }
          : {}),
        discoveredAt: now,
        isDiscovered: true,
        lastSyncedAt: now,
        pricingType: pricingTypeForUnit(modelInfo.billingUnit),
      });

      this.logger.log(`${context} created draft model: ${modelKey}`, {
        category: modelInfo.category,
        categoryConfidence: modelInfo.categoryConfidence,
        providerCostUsd: modelInfo.providerCostUsd ?? null,
        unpricedReason: modelInfo.unpricedReason ?? null,
      });

      return draftModel;
    } catch (error: unknown) {
      // A second worker drafting the same model between the lookups above and
      // the insert is the only expected failure: the row exists, so the run
      // skips it like any other taken key.
      if (isUniqueConstraintViolation(error)) {
        this.logger.warn(
          `${context} a row already holds this model, skipping: ${modelKey}`,
        );
        return null;
      }
      // The error goes in the `trace` slot: the logger serialises an Error
      // there with its name, message and code, whereas an Error nested in the
      // context object serialises as `{}`.
      this.logger.error(
        `${context} failed to create draft model: ${modelKey}`,
        error,
        {
          category: modelInfo.category,
          endpoint: modelInfo.endpoint,
          provider: modelInfo.provider,
        },
      );
      return null;
    }
  }

  /**
   * Update `lastSyncedAt` for all models discovered from a given provider.
   * Called at the end of each sync run to track freshness.
   */
  async touchLastSyncedAt(
    provider: ModelProvider,
    endpoints: string[],
  ): Promise<void> {
    if (endpoints.length === 0) {
      return;
    }

    const context = 'ModelDiscoveryService touchLastSyncedAt';

    try {
      await this.modelsService.touchDiscoveredModels(
        provider,
        endpoints,
        new Date(),
      );

      this.logger.log(
        `${context} updated lastSyncedAt for ${endpoints.length} models`,
      );
    } catch (error: unknown) {
      this.logger.error(`${context} failed to update lastSyncedAt`, { error });
    }
  }

  /**
   * Fetch the OpenAPI schema for a specific model version from Replicate.
   * This schema contains input/output field definitions used for category detection.
   */
  async fetchReplicateSchema(
    owner: string,
    name: string,
    versionId: string,
  ): Promise<IReplicateVersionDetail | null> {
    const context = 'ModelDiscoveryService fetchReplicateSchema';
    const token = this.configService.get('REPLICATE_KEY');

    if (!token) {
      this.logger.warn(`${context} REPLICATE_KEY not configured`);
      return null;
    }

    try {
      const url = `https://api.replicate.com/v1/models/${owner}/${name}/versions/${versionId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
        signal: AbortSignal.timeout(REPLICATE_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `${context} Replicate API returned ${response.status} for ${owner}/${name}`,
        );
        return null;
      }

      const data = (await response.json()) as IReplicateVersionDetail;
      return data;
    } catch (error: unknown) {
      this.logger.error(
        `${context} failed to fetch schema for ${owner}/${name}`,
        { error },
      );
      return null;
    }
  }

  /**
   * Fetch an exact Replicate model. The discovery listing is intentionally
   * bounded, so this keeps every existing registry row synchronized even when
   * it no longer appears in the first listing pages.
   */
  async fetchReplicateModel(
    owner: string,
    name: string,
  ): Promise<ReplicateModelFetch> {
    const context = 'ModelDiscoveryService fetchReplicateModel';
    const token = this.configService.get('REPLICATE_KEY');

    if (!token) {
      this.logger.warn(`${context} REPLICATE_KEY not configured`);
      return { status: 'failed' };
    }

    try {
      const response = await fetch(
        `https://api.replicate.com/v1/models/${owner}/${name}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'GET',
          signal: AbortSignal.timeout(REPLICATE_REQUEST_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `${context} Replicate API returned ${response.status} for ${owner}/${name}`,
        );
        return response.status === 404
          ? { status: 'not_found' }
          : { status: 'failed' };
      }

      return {
        model: (await response.json()) as IReplicateModel,
        status: 'ok',
      };
    } catch (error: unknown) {
      this.logger.error(`${context} failed for ${owner}/${name}`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return { status: 'failed' };
    }
  }

  /**
   * Read the structured billing tiers from the public Replicate model page
   * (`billingConfig.current_tiers`). Never throws: an unreachable or changed
   * page is reported as unavailable so the sync keeps the last approved rate.
   */
  async fetchReplicateBilling(
    owner: string,
    name: string,
  ): Promise<ReplicateBillingObservation> {
    const context = 'ModelDiscoveryService fetchReplicateBilling';
    const sourceUrl = `https://replicate.com/${owner}/${name}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REPLICATE_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(sourceUrl, {
        headers: { Accept: 'text/html' },
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          `${context} Replicate page returned ${response.status} for ${owner}/${name}`,
        );
        return {
          reason: `page_status_${response.status}`,
          status: 'unavailable',
        };
      }
      const tiers = extractReplicateBillingTiers(await response.text());
      return tiers
        ? { sourceUrl, status: 'ok', tiers }
        : { reason: 'no_billing_config', status: 'unavailable' };
    } catch (error: unknown) {
      this.logger.error(`${context} failed for ${owner}/${name}`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return { reason: 'page_fetch_failed', status: 'unavailable' };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Resolve the category of one discovered model (#4869, epic #4863).
   *
   * Three layers, in order:
   * 1. the provider's own output schema, when it states the media type
   *    outright — structure beats inference and costs nothing, so the
   *    decision provider is never called for it;
   * 2. a typed choice over the closed `ModelCategory` enum, in `shadow`
   *    (recorded, not acted on) or `live` (acted on at or above the
   *    threshold) mode;
   * 3. the keyword table, which is both the `off` path and the fallback for
   *    every provider failure and every sub-threshold answer.
   *
   * This never throws and never rejects: a discovery run must not fail because
   * a classifier was unreachable.
   */
  async classifyCategory(
    input: IModelCategoryDetectionInput,
  ): Promise<IModelCategoryDecision> {
    const schema = input.schema ?? {};
    // What the provider bills for outranks every reading of the model's own
    // wording: recraft-v3 bills per image whatever words its style list holds.
    const billed = input.billingFamily
      ? this.categoryFromBillingFamily(input, schema)
      : null;
    if (billed) return { category: billed, source: 'billing' };
    // fal publishes its task category as a tag, and the keyword table has
    // always matched on it, so tags stay part of the deterministic text.
    const text = [input.description ?? '', ...(input.tags ?? [])]
      .join(' ')
      .trim();

    const structural = this.detectFromOutputSchema(schema);
    if (structural?.isUnambiguous) {
      return { category: structural.category, source: 'output-schema' };
    }

    const deterministic = this.detectCategory(schema, text);
    const deterministicSource: ModelCategoryDecisionSource = structural
      ? 'output-schema'
      : 'keyword';
    const { minConfidence, mode } = resolveModelDiscoveryDecisionSettings(
      await this.platformSettingsService.getFeatureSettings(),
    );

    if (mode === 'off') {
      return { category: deterministic, source: deterministicSource };
    }

    const answer = await this.chooseCategory(
      input,
      schema,
      text,
      deterministic,
      mode,
    );

    // `null` and a sub-threshold confidence are the same thing to a caller:
    // keep the deterministic answer. Shadow mode never acts on the provider,
    // and persisting a confidence is acting — the recorded decision is what
    // shadow mode is for, so nothing reaches the row.
    if (!answer || mode !== 'live') {
      return { category: deterministic, source: deterministicSource };
    }

    if (answer.confidence < minConfidence) {
      // Not a failure — the draft is already created pending, and the recorded
      // confidence is what tells an operator why it is worth a second look.
      //
      // Only when the provider picked the category we are keeping, though:
      // `categoryConfidence` renders under the category badge, so a number
      // carried over from a category the provider did *not* choose would read
      // as a confidence in the wrong answer. A disagreement below the
      // threshold is recorded through the decision telemetry instead, where
      // both answers are visible.
      return {
        category: deterministic,
        source: deterministicSource,
        ...(answer.value === deterministic
          ? { confidence: answer.confidence }
          : {}),
      };
    }

    return {
      category: answer.value,
      confidence: answer.confidence,
      source: 'typed-decision',
    };
  }

  /**
   * Narrow a billed media family to one category. Only the endpoint name and
   * the input field names are read here, never the schema's enums or prose,
   * because a single stray word in those ("motion_blur") is what misread
   * models before. `edit`, `modify` and `upscale` in the endpoint are the
   * provider's own naming of what the model does.
   */
  private categoryFromBillingFamily(
    input: IModelCategoryDetectionInput,
    schema: Record<string, unknown>,
  ): ModelCategory | null {
    const endpoint = input.endpoint.toLowerCase();
    switch (input.billingFamily) {
      case 'image':
        if (UPSCALE_ENDPOINT_PATTERN.test(endpoint))
          return ModelCategory.IMAGE_UPSCALE;
        return EDIT_ENDPOINT_PATTERN.test(endpoint)
          ? ModelCategory.IMAGE_EDIT
          : ModelCategory.IMAGE;
      case 'video':
        if (UPSCALE_ENDPOINT_PATTERN.test(endpoint))
          return ModelCategory.VIDEO_UPSCALE;
        return EDIT_ENDPOINT_PATTERN.test(endpoint)
          ? ModelCategory.VIDEO_EDIT
          : ModelCategory.VIDEO;
      case 'text':
        return ModelCategory.TEXT;
      case 'voice':
        return ModelCategory.VOICE;
      case 'audio': {
        // Billed per second of output audio: speech or music. Speech models
        // say so in their name, description or input fields.
        const fields = this.inputFieldNames(schema).join(' ');
        const hint = `${endpoint} ${(input.description ?? '').toLowerCase()} ${fields}`;
        return VOICE_HINT_PATTERN.test(hint)
          ? ModelCategory.VOICE
          : ModelCategory.MUSIC;
      }
      default:
        return null;
    }
  }

  private inputFieldNames(schema: Record<string, unknown>): string[] {
    const components = schema?.components as
      | Record<string, unknown>
      | undefined;
    const schemas = components?.schemas as
      | Record<string, Record<string, unknown>>
      | undefined;
    const properties = (schemas?.Input ?? schemas?.input)?.properties;
    return properties && typeof properties === 'object'
      ? Object.keys(properties).map((name) => name.toLowerCase())
      : [];
  }

  /**
   * The provider call itself. `TypedDecisionService` already resolves `null`
   * for every provider failure; the try/catch only covers a call-site
   * programming error, which must still not fail the discovery job.
   */
  private async chooseCategory(
    input: IModelCategoryDetectionInput,
    schema: Record<string, unknown>,
    text: string,
    deterministic: ModelCategory,
    mode: TypedDecisionMode,
  ): Promise<TypedDecisionAnswer<ModelCategory> | null> {
    try {
      return await this.typedDecisionService.choose<ModelCategory>(
        {
          options: MODEL_CATEGORY_OPTIONS,
          question: MODEL_CATEGORY_QUESTION,
          state: this.buildCategoryState(input, schema, text),
        },
        {
          decisionPoint: MODEL_DISCOVERY_CATEGORY_DECISION_POINT,
          // Shadow-mode agreement against this is what gates the flip to live.
          deterministicAnswer: deterministic,
          mode,
          // Background cron: the epic's 2s async budget, not the 800ms default
          // sized for the agent turn.
          timeoutMs: MODEL_DISCOVERY_DECISION_TIMEOUT_MS,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'ModelDiscoveryService classifyCategory decision failed',
        { endpoint: input.endpoint, error },
      );
      return null;
    }
  }

  /**
   * The state the provider judges: what a human reviewer reads off the model
   * page. Bounded on every axis so one oversized OpenAPI document cannot blow
   * up a decision, and carries no credentials or tenant data.
   */
  private buildCategoryState(
    input: IModelCategoryDetectionInput,
    schema: Record<string, unknown>,
    text: string,
  ): Record<string, unknown> {
    return {
      description: this.truncate(text),
      inputFields: this.summarizeSchemaFields(schema, 'Input'),
      modelName: input.endpoint,
      outputSchema: this.summarizeOutputSchema(schema),
      provider: input.provider,
      tags: (input.tags ?? []).slice(0, MAX_STATE_SCHEMA_FIELDS),
    };
  }

  /**
   * Detect the model category by inspecting the OpenAPI schema.
   * Analyzes input/output property descriptions, types, and formats
   * to determine if the model produces images, videos, text, audio, etc.
   *
   * Falls back to description-based detection if schema inspection is
   * inconclusive. This is the deterministic path: the `off` mode, and the
   * fallback every other mode degrades to.
   */
  detectCategory(
    schema: Record<string, unknown>,
    description: string = '',
  ): ModelCategory {
    const context = 'ModelDiscoveryService detectCategory';

    try {
      // Collect all text from schema for keyword matching
      const schemaText = this.extractSchemaText(schema).toLowerCase();
      const descriptionLower = description.toLowerCase();
      const combinedText = `${schemaText} ${descriptionLower}`;

      // Check output schema first (most reliable signal)
      const outputCategory = this.detectFromOutputSchema(schema);
      if (outputCategory) {
        return outputCategory.category;
      }

      // Fall back to keyword matching on combined text
      for (const rule of CATEGORY_DETECTION_RULES) {
        const isMatch = rule.keywords.some((keyword) =>
          combinedText.includes(keyword),
        );
        if (isMatch) {
          return rule.category;
        }
      }

      this.logger.log(
        `${context} could not detect category, defaulting to IMAGE`,
      );
      return ModelCategory.IMAGE;
    } catch (error: unknown) {
      this.logger.error(`${context} error during category detection`, {
        error,
      });
      return ModelCategory.IMAGE;
    }
  }

  /**
   * Detect category from the output section of the OpenAPI schema.
   * Output format is the strongest signal for model type.
   *
   * `isUnambiguous` separates a positive structural statement ("this returns
   * an mp4") from an inference ("an array of URIs is probably images"). Only
   * the former is allowed to skip the decision provider.
   */
  private detectFromOutputSchema(
    schema: Record<string, unknown>,
  ): IOutputSchemaCategorySignal | null {
    const components = schema?.components as
      | Record<string, unknown>
      | undefined;
    const schemas = components?.schemas as
      | Record<string, Record<string, unknown>>
      | undefined;

    if (!schemas) {
      return null;
    }

    // Look for Output schema
    const outputSchema = schemas.Output || schemas.output;
    if (!outputSchema) {
      return null;
    }

    const outputType = outputSchema.type as string | undefined;
    const outputFormat = outputSchema.format as string | undefined;
    const outputDescription = (
      (outputSchema.description as string) || ''
    ).toLowerCase();

    // URI format with video hints
    if (outputFormat === 'uri' || outputType === 'string') {
      if (
        outputDescription.includes('video') ||
        outputDescription.includes('mp4')
      ) {
        return { category: ModelCategory.VIDEO, isUnambiguous: true };
      }
      if (
        outputDescription.includes('audio') ||
        outputDescription.includes('music')
      ) {
        return { category: ModelCategory.MUSIC, isUnambiguous: true };
      }
      if (
        outputDescription.includes('image') ||
        outputDescription.includes('png') ||
        outputDescription.includes('jpg')
      ) {
        return { category: ModelCategory.IMAGE, isUnambiguous: true };
      }
    }

    // Array of URIs typically means images — but video and audio models return
    // the same shape, so this is a guess the decision provider may improve on.
    if (outputType === 'array') {
      const items = outputSchema.items as ISchemaProperty | undefined;
      if (items?.format === 'uri') {
        return { category: ModelCategory.IMAGE, isUnambiguous: false };
      }
    }

    // String output typically means text. Negative inference: it only says the
    // description mentioned neither image nor video, so it never short-circuits.
    if (outputType === 'string' && !outputFormat) {
      if (
        !outputDescription.includes('image') &&
        !outputDescription.includes('video')
      ) {
        return { category: ModelCategory.TEXT, isUnambiguous: false };
      }
    }

    return null;
  }

  /** `name: type` for the first bounded slice of a schema's properties. */
  private summarizeSchemaFields(
    schema: Record<string, unknown>,
    schemaName: string,
  ): string[] {
    const components = schema?.components as
      | Record<string, unknown>
      | undefined;
    const schemas = components?.schemas as
      | Record<string, Record<string, unknown>>
      | undefined;
    const target = schemas?.[schemaName] ?? schemas?.[schemaName.toLowerCase()];
    const properties = target?.properties as
      | Record<string, ISchemaProperty>
      | undefined;

    if (!properties) {
      return [];
    }

    return Object.entries(properties)
      .slice(0, MAX_STATE_SCHEMA_FIELDS)
      .map(([name, property]) => `${name}: ${property?.type ?? 'unknown'}`);
  }

  /** The three output fields that carry signal, without the whole document. */
  private summarizeOutputSchema(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const components = schema?.components as
      | Record<string, unknown>
      | undefined;
    const schemas = components?.schemas as
      | Record<string, Record<string, unknown>>
      | undefined;
    const outputSchema = schemas?.Output ?? schemas?.output;

    if (!outputSchema) {
      return {};
    }

    const items = outputSchema.items as ISchemaProperty | undefined;

    return {
      description: this.truncate(
        typeof outputSchema.description === 'string'
          ? outputSchema.description
          : '',
      ),
      format:
        typeof outputSchema.format === 'string' ? outputSchema.format : '',
      itemFormat: items?.format ?? '',
      type: typeof outputSchema.type === 'string' ? outputSchema.type : '',
    };
  }

  private truncate(value: string): string {
    return value.length > MAX_STATE_TEXT_LENGTH
      ? `${value.slice(0, MAX_STATE_TEXT_LENGTH)}…`
      : value;
  }

  /**
   * Recursively extract all string values from a schema object
   * for keyword matching purposes.
   */
  private extractSchemaText(obj: unknown): string {
    if (typeof obj === 'string') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.extractSchemaText(item)).join(' ');
    }

    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj)
        .map((val) => this.extractSchemaText(val))
        .join(' ');
    }

    return '';
  }

  /**
   * Build a human-readable display label from owner/name.
   * Converts kebab-case to Title Case and formats creator name.
   *
   * @example "black-forest-labs/flux-2-pro" -> "Flux 2 Pro"
   * @example "google/imagen-4" -> "Imagen 4"
   * @example "fal-ai/flux/dev" -> "Flux Dev"
   */
  private buildDisplayLabel(_owner: string, name: string): string {
    return name
      .split(LABEL_SEPARATOR_PATTERN)
      .map((part) => {
        // Keep version numbers as-is
        if (LEADING_DIGIT_PATTERN.test(part)) {
          return part;
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  }
}
