import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { ModelCategory, type ModelKey } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type {
  IModelDiscoveryInput,
  IReplicateVersionDetail,
} from '@workers/interfaces/model-discovery.interface';
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

/** Category detection keywords mapped to their respective ModelCategory */
const CATEGORY_DETECTION_RULES: Array<{
  keywords: string[];
  category: ModelCategory;
}> = [
  {
    category: ModelCategory.VIDEO,
    keywords: ['video', 'mp4', 'animation', 'motion', 'clip'],
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
    category: ModelCategory.IMAGE_UPSCALE,
    keywords: ['upscale', 'super-resolution', 'enhance'],
  },
  {
    category: ModelCategory.IMAGE_EDIT,
    keywords: ['image-edit', 'inpaint', 'outpaint', 'edit'],
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

@Injectable()
export class ModelDiscoveryService {
  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly modelPricingService: ModelPricingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a draft model entry in the database.
   * Draft models are created with isActive: false and require manual review
   * before being activated for users.
   */
  async createDraftModel(
    modelInfo: IModelDiscoveryInput,
  ): Promise<ModelDocument | null> {
    const context = 'ModelDiscoveryService createDraftModel';
    const modelKey = `${modelInfo.owner}/${modelInfo.name}`;

    try {
      // Verify model doesn't already exist (defense in depth)
      const existing = await this.modelsService.findOne({
        isDeleted: false,
        key: modelKey,
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
      const pricing = this.modelPricingService.estimateCost(
        modelInfo.category,
        modelInfo.owner,
        existingModels,
      );

      // Build the display label from owner/name
      const label = this.buildDisplayLabel(modelInfo.owner, modelInfo.name);

      // Create draft model document with base DTO fields
      const createData = {
        category: modelInfo.category,
        cost: pricing.cost,
        description:
          modelInfo.description ||
          `Auto-discovered model from ${modelInfo.owner}. Pending manual review.`,
        isActive: false,
        isDefault: false,
        isHighlighted: false,
        key: modelKey as ModelKey,
        label,
        provider: modelInfo.provider,
      };

      const draftModel = await this.modelsService.create(createData);

      // Patch with dynamic pricing fields (not in CreateModelDto but supported by schema)
      await this.modelsService.patch(draftModel._id, {
        costPerUnit: pricing.costPerUnit,
        minCost: pricing.minCost,
        pricingType: pricing.pricingType,
      });

      this.logger.log(`${context} created draft model: ${modelKey}`, {
        category: modelInfo.category,
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
   * Detect the model category by inspecting the OpenAPI schema.
   * Analyzes input/output property descriptions, types, and formats
   * to determine if the model produces images, videos, text, audio, etc.
   *
   * Falls back to description-based detection if schema inspection is inconclusive.
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
        return outputCategory;
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
   */
  private detectFromOutputSchema(
    schema: Record<string, unknown>,
  ): ModelCategory | null {
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
        return ModelCategory.VIDEO;
      }
      if (
        outputDescription.includes('audio') ||
        outputDescription.includes('music')
      ) {
        return ModelCategory.MUSIC;
      }
      if (
        outputDescription.includes('image') ||
        outputDescription.includes('png') ||
        outputDescription.includes('jpg')
      ) {
        return ModelCategory.IMAGE;
      }
    }

    // Array of URIs typically means images
    if (outputType === 'array') {
      const items = outputSchema.items as ISchemaProperty | undefined;
      if (items?.format === 'uri') {
        return ModelCategory.IMAGE;
      }
    }

    // String output typically means text
    if (outputType === 'string' && !outputFormat) {
      if (
        !outputDescription.includes('image') &&
        !outputDescription.includes('video')
      ) {
        return ModelCategory.TEXT;
      }
    }

    return null;
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
   */
  private buildDisplayLabel(owner: string, name: string): string {
    return name
      .split('-')
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
