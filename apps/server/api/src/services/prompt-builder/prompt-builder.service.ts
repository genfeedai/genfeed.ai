import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import type { IPromptBuilder } from '@api/services/prompt-builder/interfaces/prompt-builder.interface';
import type {
  BrandingMode,
  PromptBuilderParams,
} from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  PromptBuilderResult,
  PromptTemplateVariables,
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import {
  ContentTemplateKey,
  ModelCategory,
  ModelKey,
  ModelProvider,
  PromptTemplateKey,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Main prompt builder service
 * Routes to the appropriate provider-specific builder
 */
@Injectable()
export class PromptBuilderService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly builders: Map<ModelProvider, IPromptBuilder>;

  /**
   * Default template keys for each model category
   * Used when no explicit template key is provided (or when preset key is passed)
   */
  private static readonly DEFAULT_TEMPLATE_KEYS: Record<ModelCategory, string> =
    {
      [ModelCategory.VIDEO]: ContentTemplateKey.VIDEO_DEFAULT,
      [ModelCategory.IMAGE]: ContentTemplateKey.IMAGE_DEFAULT,
      [ModelCategory.MUSIC]: ContentTemplateKey.MUSIC_DEFAULT,
      [ModelCategory.TEXT]: PromptTemplateKey.TEXT_DEFAULT,
      [ModelCategory.IMAGE_EDIT]: '',
      [ModelCategory.VIDEO_EDIT]: '',
      [ModelCategory.IMAGE_UPSCALE]: '',
      [ModelCategory.VIDEO_UPSCALE]: '',
      [ModelCategory.VOICE]: '',
      [ModelCategory.EMBEDDING]: '',
    };

  constructor(
    private readonly loggerService: LoggerService,
    private readonly templatesService: TemplatesService,
    replicateBuilder: ReplicatePromptBuilder,
  ) {
    // Register all builders - all AI models now route through Replicate
    this.builders = new Map<ModelProvider, IPromptBuilder>([
      [ModelProvider.REPLICATE, replicateBuilder],
    ]);
  }

  private resolveBrandingMode(params: PromptBuilderParams): BrandingMode {
    if (params.brandingMode) {
      return params.brandingMode;
    }

    return params.isBrandingEnabled ? 'brand' : 'off';
  }

  /**
   * Build template variables from prompt builder params
   * Only includes non-empty values to work with {{#if}} conditionals
   */
  private buildTemplateVariables(
    params: PromptBuilderParams,
  ): PromptTemplateVariables {
    const variables: PromptTemplateVariables = {
      height: params.height || 1080,
      // Always include base prompt and technical specs
      prompt: params.prompt || '',
      resolution: params.resolution || '1080p',
      width: params.width || 1920,
    };

    // Only add optional fields if they have values
    // This ensures {{#if mood}} and similar conditionals work correctly
    if (params.mood) {
      variables.mood = params.mood;
    }
    if (params.style) {
      variables.style = params.style;
    }
    if (params.camera) {
      variables.camera = params.camera;
    }
    if (params.cameraMovement) {
      variables.cameraMovement = params.cameraMovement;
    }
    if (params.lens) {
      variables.lens = params.lens;
    }
    if (params.scene) {
      variables.scene = params.scene;
    }
    if (params.lighting) {
      variables.lighting = params.lighting;
    }
    if (params.speech) {
      variables.speech = params.speech;
    }
    if (params.duration) {
      variables.duration = params.duration;
    }

    // Arrays
    if (params.sounds?.length) {
      variables.sounds = params.sounds.join(', ');
    }

    // Brand info
    if (params.brand?.label) {
      variables.brandName = params.brand.label;
    }
    if (params.brand?.description) {
      variables.brandDescription = params.brand.description;
    }
    if (params.brand?.text) {
      variables.brandText = params.brand.text;
    }

    // Branding metadata from Knowledge Base
    if (params.branding?.tone) {
      variables.brandTone = params.branding.tone;
    }
    if (params.branding?.voice) {
      variables.brandVoice = params.branding.voice;
    }
    if (params.branding?.audience) {
      variables.brandAudience = params.branding.audience;
    }
    if (params.branding?.values?.length) {
      variables.brandValues = params.branding.values.join(', ');
    }
    if (params.branding?.taglines?.length) {
      variables.brandTaglines = params.branding.taglines.join(', ');
    }
    if (params.branding?.hashtags?.length) {
      variables.brandHashtags = params.branding.hashtags.join(' ');
    }

    return variables;
  }

  /**
   * Get default template key for content category
   */
  private getDefaultTemplateKey(category: ModelCategory): string {
    return PromptBuilderService.DEFAULT_TEMPLATE_KEYS[category] || '';
  }

  /**
   * Build brand context prompt from template
   * @param variables - Template variables including brand metadata
   * @returns Rendered brand context prompt or empty string if branding not enabled
   */
  private async buildBrandContext(
    variables: PromptTemplateVariables,
  ): Promise<string> {
    // Only build brand context if brand name is present
    if (!variables.brandName) {
      return '';
    }

    const brandTemplate = await this.templatesService.getPromptByKey(
      'system.brand-context',
    );

    if (brandTemplate?.isActive) {
      return this.templatesService.renderPrompt(
        brandTemplate.content,
        variables,
      );
    }

    return '';
  }

  /**
   * Build system prompt from template for TEXT models
   * Includes brand context if branding is enabled
   * @param templateKey - System prompt template key (e.g., 'text.system.enhancement')
   * @param variables - Template variables
   * @param organizationId - Organization ID for template overrides
   * @returns Rendered system prompt or default fallback
   */
  private async buildSystemPrompt(
    templateKey: string,
    variables: PromptTemplateVariables,
    organizationId?: string,
  ): Promise<string> {
    const defaultSystemPrompt =
      'You are an expert AI assistant. Follow the instructions carefully and provide high-quality responses.';

    const template = await this.templatesService.getPromptByKey(
      templateKey,
      organizationId,
    );

    if (template?.isActive) {
      return this.templatesService.renderPrompt(template.content, variables);
    }

    return defaultSystemPrompt;
  }

  /**
   * Build provider-specific prompt parameters
   * Now supports template-based prompts
   * @param model - The model to build prompt for
   * @param params - Universal prompt parameters
   * @param organizationId - Organization ID for template overrides
   * @returns Provider-specific formatted parameters with template metadata
   */
  async buildPrompt(
    model: ModelKey,
    params: PromptBuilderParams,
    organizationId?: string,
  ): Promise<PromptBuilderResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.debug(`${url} started`, { model, params });

      // Initialize with basic prompt as default
      let promptText: string = params.prompt;
      let templateKey: string | undefined;
      let templateVersion: number | undefined;

      // Build template variables (needed for both template and brand context)
      const variables = this.buildTemplateVariables(params);

      // Try to use template if enabled
      if (params.useTemplate !== false) {
        const modelSpecificKey = PromptParser.getModelSystemPromptTemplateKey(
          model.toString(),
        );

        // Use category from DB (passed from ModelsGuard via params.modelCategory)
        const resolvedCategory = params.modelCategory;
        const categoryDefaultKey = this.getDefaultTemplateKey(resolvedCategory);

        // Try templates in priority order:
        // 1. Explicit promptTemplate from params (if it's a real template key, not a preset)
        // 2. Model-specific template (e.g., system.model.nano-banana-pro) - TEXT models only
        // 3. Category default (IMAGE_DEFAULT, VIDEO_DEFAULT, etc.)
        //
        // NOTE: system.model.* templates are LLM system prompts for the enhance button,
        // NOT image/video/music generation prompts. Skip them for non-TEXT models.
        //
        // NOTE: preset.* keys are NOT templates - they're preset configurations in the
        // presets collection. If a preset key is passed, fall back to category default.
        const isNonTextModel = resolvedCategory !== ModelCategory.TEXT;
        const isSystemModelTemplate =
          modelSpecificKey?.startsWith('system.model.');

        const isPresetKey = params.promptTemplate?.startsWith('preset.');

        // If promptTemplate is a preset key (preset.*), don't try to use it as a template
        // Presets provide parameters (style, mood, etc.) but templates provide the structure
        const templateKeysToTry =
          params.promptTemplate && !isPresetKey
            ? [params.promptTemplate]
            : [
                // Only use model-specific template for TEXT models (enhance button flow)
                isNonTextModel && isSystemModelTemplate
                  ? null
                  : modelSpecificKey,
                categoryDefaultKey, // Fall back to category default (e.g., IMAGE_DEFAULT)
              ].filter(Boolean);

        for (const keyToTry of templateKeysToTry) {
          if (!keyToTry) {
            continue; // Skip undefined or empty strings
          }

          const template = await this.templatesService.getPromptByKey(
            keyToTry,
            organizationId,
          );

          if (template?.isActive) {
            templateKey = keyToTry;
            promptText = this.templatesService.renderPrompt(
              template.content,
              variables,
            );
            templateVersion = template.version || 1;

            // Track template usage
            await this.templatesService.updateMetadata(keyToTry, {
              incrementUsage: true,
            });

            this.loggerService.debug(`${url} using template`, {
              isModelSpecific: keyToTry === modelSpecificKey,
              templateKey,
              templateVersion,
            });
            break; // Found a working template, stop searching
          }
        }

        if (!templateKey) {
          this.loggerService.debug(
            `${url} no template found, using basic prompt`,
            {
              model,
              triedKeys: templateKeysToTry,
            },
          );
        }
      }

      const brandingMode = this.resolveBrandingMode(params);

      // Handle TEXT models differently - they need system prompt + brand context
      // Use passed category from DB if available, otherwise guess from model key
      const modelCategory = params.modelCategory;
      let systemPromptResult: string | undefined;

      if (modelCategory === ModelCategory.TEXT) {
        // Use explicit systemPrompt if provided, otherwise build from template
        if (params.systemPrompt) {
          // Respect explicitly provided system prompt
          systemPromptResult = params.systemPrompt;
        } else {
          // Build system prompt from template
          const systemTemplateKey =
            params.systemPromptTemplate ||
            templateKey?.replace('.default', '.system') ||
            'text.system.default';

          systemPromptResult = await this.buildSystemPrompt(
            systemTemplateKey,
            variables,
            organizationId,
          );
        }

        this.loggerService.debug(`${url} TEXT model system prompt built`, {
          promptTextLength: promptText?.length,
          systemPromptLength: systemPromptResult?.length,
        });

        // Add brand context to system prompt for TEXT models
        if (brandingMode === 'brand' && params.brand) {
          const brandContext = await this.buildBrandContext(variables);
          if (brandContext) {
            systemPromptResult = `${systemPromptResult}\n\n${brandContext}`;
            this.loggerService.debug(
              `${url} added brand context to system prompt`,
              {
                brandContextLength: brandContext.length,
              },
            );
          }
        }

        // Set the final system prompt
        params = { ...params, systemPrompt: systemPromptResult };
      } else {
        // For non-TEXT models, prepend brand context to user prompt
        if (brandingMode === 'brand' && params.brand) {
          const brandContext = await this.buildBrandContext(variables);
          if (brandContext) {
            promptText = `${brandContext}\n\n${promptText}`;
            this.loggerService.debug(`${url} prepended brand context`, {
              brandContextLength: brandContext.length,
            });
          }
        }
      }

      // Find the appropriate builder
      const builder = this.getBuilderForModel(model);
      if (!builder) {
        throw new Error(`No prompt builder found for model: ${model}`);
      }

      // Build the provider-specific input with prompt text
      const input = builder.buildPrompt(model, params, promptText);

      this.loggerService.debug(`${url} completed`, { input, model });

      return {
        input,
        systemPrompt: systemPromptResult,
        templateUsed: templateKey,
        templateVersion,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, { error, model });
      throw error;
    }
  }

  /**
   * Get the appropriate builder for a model
   * @param model - Model key
   * @returns The prompt builder for this model
   */
  private getBuilderForModel(model: ModelKey): IPromptBuilder | undefined {
    // Try each builder until we find one that supports this model
    for (const builder of this.builders.values()) {
      if (builder.supportsModel(model)) {
        return builder;
      }
    }

    // If no specific builder found, try to determine by provider prefix
    const provider = this.getProviderFromModelKey(model);
    return this.builders.get(provider);
  }

  /**
   * Extract provider from model key
   * All AI models now route through Replicate
   * @param model - Model key (e.g., 'openai/sora-2', 'google/veo-3')
   * @returns Model provider (always REPLICATE)
   */
  private getProviderFromModelKey(_model: ModelKey): ModelProvider {
    // All AI models are now routed through Replicate
    return ModelProvider.REPLICATE;
  }

  /**
   * Check if a model is supported
   * @param model - Model key to check
   * @returns true if any builder supports this model
   */
  isModelSupported(model: ModelKey): boolean {
    return this.getBuilderForModel(model) !== undefined;
  }

  /**
   * Get the provider for a model
   * @param model - Model key
   * @returns The provider enum for this model
   */
  getProviderForModel(model: ModelKey): ModelProvider | undefined {
    const builder = this.getBuilderForModel(model);
    return builder?.getProvider();
  }
}
