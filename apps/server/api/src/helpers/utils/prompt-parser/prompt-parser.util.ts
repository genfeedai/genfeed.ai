import type {
  IPromptBrandContext,
  IPromptObject,
  IPromptParserOptions,
  IPromptParserResult,
} from '@api/shared/interfaces/prompt/prompt.interface';
import { PromptCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';

export class PromptParser {
  static parsePrompt(
    _configService: ConfigService | null,
    options: IPromptParserOptions,
  ): IPromptParserResult {
    const { brand, originalPrompt } = options;
    const type = options.category;

    if (!type) {
      throw new Error(
        `Prompt category is required. Received: ${String(type)}. Supported types: ${PromptParser.getSupportedTypes().join(', ')}`,
      );
    }

    const normalizedType = PromptParser.normalizeType(type);

    if (!PromptParser.isValidPromptCategory(normalizedType)) {
      throw new Error(
        `Unsupported prompt type: ${String(type)}. Supported types: ${PromptParser.getSupportedTypes().join(', ')}`,
      );
    }

    const promptObject = PromptParser.buildPromptObject(brand, originalPrompt);
    const promptString = JSON.stringify(promptObject);

    return {
      normalizedType,
      promptObject,
      promptString,
    };
  }

  private static buildPromptObject(
    brand: IPromptBrandContext | null | undefined,
    originalPrompt: string,
  ): IPromptObject {
    const promptData: IPromptObject = {
      prompt: originalPrompt,
    };

    if (brand) {
      promptData.brand = {
        backgroundColor: brand?.backgroundColor,
        description: brand?.description || '',
        label: brand?.label || '',
        primaryColor: brand?.primaryColor,
        secondaryColor: brand?.secondaryColor,
        systemPrompt: brand?.text || '',
      };
    }

    return promptData;
  }

  private static isValidPromptCategory(
    category: string,
  ): category is PromptCategory {
    return Object.values(PromptCategory).includes(category as PromptCategory);
  }

  private static normalizeType(type: string): string {
    if (!type) {
      return type;
    }

    // Already the canonical Prisma SCREAMING_SNAKE form (e.g.
    // 'MODELS_PROMPT_IMAGE') — pass through unmodified.
    if (PromptParser.isValidPromptCategory(type)) {
      return type;
    }

    // Training models (special case) — checked before the generic hyphen
    // normalization below since 'genfeedai'/'trainer' aren't literal
    // category spellings.
    const key = type.toLowerCase();
    if (key.includes('genfeedai') || key.includes('trainer')) {
      return PromptCategory.MODELS_PROMPT_TRAINING;
    }

    // Legacy lowercase-hyphen spellings (e.g. 'models-prompt-image') map onto
    // the Prisma SCREAMING_SNAKE form.
    if (
      key.startsWith('models-prompt-') ||
      key.startsWith('presets-') ||
      key.startsWith('brand-') ||
      key.startsWith('storyboard-') ||
      key.startsWith('post-content-') ||
      key.startsWith('post-title-')
    ) {
      return key.replace(/-/g, '_').toUpperCase();
    }

    // Model category should come from DB via ModelsGuard, not guessed from strings
    // DTOs validate with @IsEnum(PromptCategory) - unknown types should error
    throw new Error(
      `Invalid prompt category: ${type}. Category must be a valid PromptCategory enum value.`,
    );
  }

  static getSupportedTypes(): string[] {
    return Object.values(PromptCategory);
  }

  /**
   * Maps model key to model-specific system prompt template key
   *
   * Converts model keys like 'black-forest-labs/flux-2-pro' to template keys
   * like 'system.model.flux-2-pro' (matching templates.seed.js format).
   *
   * @param modelKey - The model key from ModelKey enum (e.g., 'black-forest-labs/flux-2-pro')
   * @returns Template key for model-specific system prompt (e.g., 'system.model.flux-2-pro')
   */
  static getModelSystemPromptTemplateKey(modelKey: string): string {
    if (!modelKey) {
      return '';
    }

    // Normalize model key: extract the model name from provider/model format
    // e.g., 'black-forest-labs/flux-2-pro' -> 'flux-2-pro'
    // e.g., 'google/imagen-4' -> 'imagen-4'
    // e.g., 'ideogram-ai/ideogram-character' -> 'ideogram-character'
    const parts = modelKey.split('/');
    const modelName = parts.length > 1 ? parts[parts.length - 1] : modelKey;

    return `system.model.${modelName}`;
  }

  /**
   * Maps PromptCategory to system prompt template key
   *
   * Converts category values like 'post-content-instagram' to template keys
   * like 'system.instagram.content' following the template.seed pattern.
   *
   * @param category - The normalized prompt category
   * @returns Template key for system prompt (e.g., 'system.instagram.content')
   */
  static getSystemPromptTemplateKey(category: string): string {
    // Map category to template key following pattern: system.{platform/type}.{subtype}
    const categoryMap: Record<string, string> = {
      [PromptCategory.BRAND_DESCRIPTION]: 'system.brand-description',
      [PromptCategory.MODELS_PROMPT_TRAINING]: 'system.model.training',
      [PromptCategory.MODELS_PROMPT_IMAGE]: 'system.image', // Use rich image enhancement template
      [PromptCategory.MODELS_PROMPT_MUSIC]: 'system.music', // Use rich music enhancement template
      [PromptCategory.MODELS_PROMPT_VIDEO]: 'system.video', // Use rich video enhancement template
      [PromptCategory.POST_CONTENT_INSTAGRAM]: 'system.instagram.content',
      [PromptCategory.POST_CONTENT_TIKTOK]: 'system.tiktok.content',
      [PromptCategory.POST_CONTENT_TWITTER]: 'system.twitter.content',
      [PromptCategory.POST_CONTENT_YOUTUBE]: 'system.youtube.content',
      [PromptCategory.POST_TITLE_INSTAGRAM]: 'system.instagram.title',
      [PromptCategory.POST_TITLE_TIKTOK]: 'system.tiktok.title',
      [PromptCategory.POST_TITLE_TWITTER]: 'system.twitter.title',
      [PromptCategory.POST_TITLE_YOUTUBE]: 'system.youtube.title',
      [PromptCategory.PRESET_DESCRIPTION_IMAGE]: 'system.preset.image',
      [PromptCategory.PRESET_DESCRIPTION_MUSIC]: 'system.preset.music',
      [PromptCategory.PRESET_DESCRIPTION_TEXT]: 'system.preset.text',
      [PromptCategory.PRESET_DESCRIPTION_VIDEO]: 'system.preset.video',
      [PromptCategory.STORYBOARD_SCRIPT_DESCRIPTION]:
        'system.storyboard.script',
    };

    return categoryMap[category] || 'system.default';
  }
}
