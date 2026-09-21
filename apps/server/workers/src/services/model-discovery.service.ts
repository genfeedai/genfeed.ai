import { ModelsService } from '@api/collections/models/services/models.service';
import { getProviderModelKey } from '@api/collections/models/utils/model-key.util';
import type { ServerModelRecord } from '@api/index';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type {
  TypedDecisionAnswer,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';
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
import { ModelPricingService } from '@workers/services/model-pricing.service';

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
 * fire. #4869 fixed two rules that were dead on arrival:
 * - generic `video` sat above VIDEO_UPSCALE / VIDEO_EDIT and swallowed
 *   every `video upscale` and `video edit` model into plain VIDEO;
 * - IMAGE_UPSCALE's generic `enhance` sat above IMAGE_EDIT and swallowed
 *   every "edit and enhance" image model into IMAGE_UPSCALE.
 *
 * Add new rules specific-first, and add a spec for the pair you are ordering
 * against — a shadowed rule is invisible until someone reads the table.
 */
const CATEGORY_DETECTION_RULES: Array<{
  keywords: string[];
  category: ModelCategory;
}> = [
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
    keywords: ['video', 'mp4', 'animation', 'motion', 'clip'],
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
    category: ModelCategory.EMBEDDING,
    keywords: ['embedding', 'encode', 'clip'],
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

@Injectable()
export class ModelDiscoveryService {
  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly modelPricingService: ModelPricingService,
    private readonly configService: ConfigService,
    private readonly typedDecisionService: TypedDecisionService,
  ) {}

  /**
   * Create a draft model entry in the database.
   * Draft models are created with isActive: false and require manual review
   * before being activated for users.
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

      // Fetch existing models for pricing estimation
      const existingModels = await this.modelsService.findAllActive();

      // Estimate pricing based on category and creator patterns
      const pricing =
        typeof modelInfo.providerCostUsd === 'number' &&
        modelInfo.providerCostUsd > 0
          ? this.modelPricingService.estimateFromProviderCost(
              modelInfo.providerCostUsd,
              modelInfo.category,
            )
          : this.modelPricingService.estimateCost(
              modelInfo.category,
              modelInfo.owner,
              existingModels,
            );

      // Providers that publish a display name win; the rest get a title-cased
      // model name.
      const label =
        modelInfo.label?.trim() ||
        this.buildDisplayLabel(modelInfo.owner, modelInfo.name);

      // Create draft model document with base DTO fields
      const createData = {
        category: modelInfo.category,
        cost: pricing.cost,
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
        costPerUnit: pricing.costPerUnit,
        discoveredAt: now,
        isDiscovered: true,
        lastSyncedAt: now,
        minCost: pricing.minCost,
        pricingType: pricing.pricingType,
      });

      this.logger.log(`${context} created draft model: ${modelKey}`, {
        category: modelInfo.category,
        categoryConfidence: modelInfo.categoryConfidence,
        cost: pricing.cost,
        pricingType: pricing.pricingType,
      });

      return draftModel;
    } catch (error: unknown) {
      this.logger.error(
        `${context} failed to create draft model: ${modelKey}`,
        {
          error,
          modelInfo,
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
  ): Promise<IReplicateModel | null> {
    const context = 'ModelDiscoveryService fetchReplicateModel';
    const token = this.configService.get('REPLICATE_KEY');

    if (!token) {
      this.logger.warn(`${context} REPLICATE_KEY not configured`);
      return null;
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
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `${context} Replicate API returned ${response.status} for ${owner}/${name}`,
        );
        return null;
      }

      return (await response.json()) as IReplicateModel;
    } catch (error: unknown) {
      this.logger.error(`${context} failed for ${owner}/${name}`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return null;
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
      this.configService,
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
    // keep the deterministic answer. Shadow mode never acts on the provider.
    if (!answer || mode !== 'live') {
      return {
        category: deterministic,
        source: deterministicSource,
        ...(answer ? { confidence: answer.confidence } : {}),
      };
    }

    if (answer.confidence < minConfidence) {
      // Not a failure — the draft is already created pending, and the recorded
      // confidence is what tells an operator why it is worth a second look.
      return {
        category: deterministic,
        confidence: answer.confidence,
        source: deterministicSource,
      };
    }

    return {
      category: answer.value,
      confidence: answer.confidence,
      source: 'typed-decision',
    };
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
      .split(/[-/]/)
      .map((part) => {
        // Keep version numbers as-is
        if (/^\d/.test(part)) {
          return part;
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  }
}
