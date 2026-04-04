import { ConfigService } from '@api/config/config.service';
import type {
  IPromptBrandContext,
  IPromptObject,
  IPromptParserOptions,
  IPromptParserResult,
} from '@api/shared/interfaces/prompt/prompt.interface';
import { PromptCategory } from '@genfeedai/enums';

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

    // Pass through valid category prefixes without modification
    if (
      type.startsWith('models-prompt-') ||
      type.startsWith('presets-') ||
      type.startsWith('brand-') ||
      type.startsWith('storyboard-') ||
      type.startsWith('post-content-') ||
      type.startsWith('post-title-')
    ) {
      return type;
    }

    // Training models (special case)
    const key = type.toLowerCase();
    if (key.includes('genfeedai') || key.includes('trainer')) {
      return 'models-prompt-genfeedai';
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
      'brand-description': 'system.brand-description',
      'models-prompt-genfeedai': 'system.model.training',
      'models-prompt-image': 'system.image', // Use rich image enhancement template
      'models-prompt-music': 'system.music', // Use rich music enhancement template
      'models-prompt-video': 'system.video', // Use rich video enhancement template
      'post-content-instagram': 'system.instagram.content',
      'post-content-tiktok': 'system.tiktok.content',
      'post-content-twitter': 'system.twitter.content',
      'post-content-youtube': 'system.youtube.content',
      'post-title-instagram': 'system.instagram.title',
      'post-title-tiktok': 'system.tiktok.title',
      'post-title-twitter': 'system.twitter.title',
      'post-title-youtube': 'system.youtube.title',
      'presets-description-image': 'system.preset.image',
      'presets-description-music': 'system.preset.music',
      'presets-description-text': 'system.preset.text',
      'presets-description-video': 'system.preset.video',
      'storyboard-script-description': 'system.storyboard.script',
    };

    return categoryMap[category] || 'system.default';
  }
}
