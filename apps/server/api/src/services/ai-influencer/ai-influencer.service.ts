import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { ConfigService } from '@api/config/config.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  type GenerationResult,
  PersonaContentService,
} from '@api/services/persona-content/persona-content.service';
import {
  DarkroomReviewStatus,
  IngredientStatus,
  LoraStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';

/** Supported social platforms for AI influencer posts */
export type AiInfluencerPlatform =
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'youtube';

export type AiInfluencerPublishStatus = 'published' | 'queued' | 'failed';

/** Result of publishing to a single platform */
export interface PlatformPublishResult {
  platform: AiInfluencerPlatform;
  success: boolean;
  status: AiInfluencerPublishStatus;
  externalId?: string;
  error?: string;
}

/** Full result of generating and publishing a daily post */
export interface GeneratePostResult {
  personaSlug: string;
  ingredientId: string;
  caption: string;
  imageUrl: string;
  publishResults: PlatformPublishResult[];
  videoResult?: GenerationResult;
  voiceResult?: GenerationResult;
}

/** Configuration for image generation */
interface ImageGenerationConfig {
  prompt: string;
  loraPath?: string;
  width: number;
  height: number;
}

const SUPPORTED_PLATFORMS: readonly AiInfluencerPlatform[] = [
  'instagram',
  'twitter',
  'tiktok',
  'youtube',
] as const;

const DEFAULT_IMAGE_WIDTH = 1024;
const DEFAULT_IMAGE_HEIGHT = 1024;
const CAPTION_MODEL = 'anthropic/claude-sonnet-4-5-20250929';
const IMAGE_MODEL = 'fal-ai/flux-lora';
const MAX_CAPTION_LENGTH = 2200; // Instagram caption limit
const CAPTION_TEMPERATURE = 0.8;

@Injectable()
export class AiInfluencerService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly personasService: PersonasService,
    private readonly ingredientsService: IngredientsService,
    private readonly falService: FalService,
    private readonly openRouterService: OpenRouterService,
    private readonly instagramService: InstagramService,
    private readonly twitterService: TwitterService,
    private readonly personaContentService: PersonaContentService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  private readObjectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const entries = value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );

    return entries.length > 0 ? entries : undefined;
  }

  private readReferenceId(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    const record = this.readObjectRecord(value);
    return this.readString(record?._id ?? record?.id);
  }

  private readRequiredPersonaReference(
    persona: PersonaDocument,
    field: 'brand' | 'organization' | 'user',
  ): string {
    const personaRecord = persona as Record<string, unknown>;
    const value = this.readReferenceId(personaRecord[field]);

    if (!value) {
      throw new Error(`Persona ${field} is missing`);
    }

    return value;
  }

  private readPersonaStrategy(persona: PersonaDocument): {
    platforms?: string[];
    tone?: string;
    topics?: string[];
  } {
    const personaRecord = persona as Record<string, unknown>;
    const strategy = this.readObjectRecord(personaRecord.contentStrategy);

    return {
      platforms: this.readStringArray(strategy?.platforms),
      tone: this.readString(strategy?.tone),
      topics: this.readStringArray(strategy?.topics),
    };
  }

  private hasReadyLora(persona: PersonaDocument): boolean {
    const personaRecord = persona as Record<string, unknown>;
    const status = this.readString(personaRecord.loraStatus);

    return status === LoraStatus.READY || status === 'trained';
  }

  /**
   * Orchestrate the full daily post pipeline for a persona:
   * 1. Load persona from DB
   * 2. Generate a caption using LLM
   * 3. Generate an image using fal.ai (with persona's LoRA)
   * 4. Create an ingredient record
   * 5. Publish to requested platforms
   * 6. Return the result
   */
  async generateDailyPost(
    personaSlug: string,
    platforms: string[],
    options?: {
      promptOverride?: string;
      captionOverride?: string;
      aspectRatio?: string;
    },
  ): Promise<GeneratePostResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { personaSlug, platforms });

    // 1. Load persona
    const persona = await this.loadPersona(personaSlug);

    // Validate platforms
    const validPlatforms = this.validatePlatforms(platforms);

    // 2. Generate caption
    const caption =
      options?.captionOverride ?? (await this.generateCaption(persona));

    // 3. Build image generation config
    const imageConfig = this.buildImageConfig(persona, options);

    // 4. Generate image via fal.ai
    const imageUrl = await this.generateImage(imageConfig);

    // 5. Create ingredient record
    const ingredient = await this.createIngredientRecord(
      persona,
      imageUrl,
      caption,
    );

    const videoqueryResults = this.requiresVideoquery(validPlatforms)
      ? await this.generateVideoquery(persona, caption, ingredient._id)
      : undefined;

    // 6. Publish to platforms
    const publishResults = await this.publishToAllPlatforms(
      validPlatforms,
      imageUrl,
      caption,
      persona,
      videoqueryResults,
    );

    const result: GeneratePostResult = {
      caption,
      imageUrl,
      ingredientId: ingredient._id.toString(),
      personaSlug,
      publishResults,
      videoResult: videoqueryResults?.videoResult,
      voiceResult: videoqueryResults?.voiceResult,
    };

    this.loggerService.log(caller, {
      ingredientId: result.ingredientId,
      message: 'Daily post generated successfully',
      platforms: publishResults.map((r) => `${r.platform}:${r.success}`),
    });

    return result;
  }

  /**
   * Find all personas with autopilot enabled and generate daily posts for each.
   */
  async scheduleDailyPosts(): Promise<GeneratePostResult[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      message: 'Starting scheduled daily posts',
    });

    const personas = await this.personasService.findAll(
      {
        where: {
          isAutopilotEnabled: true,
          isDarkroomCharacter: true,
          isDeleted: false,
        },
      },
      { limit: 100, page: 1 },
    );

    const results: GeneratePostResult[] = [];
    const personaDocs = personas.docs || [];

    this.loggerService.log(caller, {
      count: personaDocs.length,
      message: 'Found personas with autopilot enabled',
    });

    for (const persona of personaDocs) {
      try {
        const personaSlug = persona.slug;
        if (!personaSlug) {
          this.loggerService.warn(caller, {
            message: 'Persona has no slug, skipping',
            personaId: persona._id?.toString(),
          });
          continue;
        }

        // Determine platforms from persona's content strategy
        const platforms = this.readPersonaStrategy(persona).platforms ?? [
          'instagram',
          'twitter',
        ];

        const result = await this.generateDailyPost(personaSlug, platforms);
        results.push(result);

        // Update last autopilot run timestamp
        await this.personasService.patch(persona._id.toString(), {
          lastAutopilotRunAt: new Date(),
        } as Parameters<PersonasService['patch']>[1]);
      } catch (error) {
        this.loggerService.error(caller, {
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to generate post for persona',
          personaId: persona._id?.toString(),
          personaSlug: persona.slug,
        });
      }
    }

    this.loggerService.log(caller, {
      message: 'Scheduled daily posts completed',
      successCount: results.length,
      totalPersonas: personaDocs.length,
    });

    return results;
  }

  /**
   * List generated AI influencer posts (ingredients with persona association).
   */
  async listPosts(filters: {
    personaSlug?: string;
    limit?: number;
    page?: number;
  }): Promise<{
    docs: IngredientDocument[];
    totalDocs: number;
    page: number;
    limit: number;
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { filters });

    const matchStage: Record<string, unknown> = {
      generationSource: { contains: /^ai-influencer/ },
      isDeleted: false,
    };

    if (filters.personaSlug) {
      matchStage.personaSlug = filters.personaSlug;
    }

    const result = await this.ingredientsService.findAll(
      { where: matchStage, orderBy: { createdAt: -1 } },
      {
        limit: filters.limit ?? 20,
        page: filters.page ?? 1,
      },
    );

    return {
      docs: result.docs,
      limit: result.limit ?? filters.limit ?? 20,
      page: result.page ?? filters.page ?? 1,
      totalDocs: result.totalDocs,
    };
  }

  // ─── Private Methods ──────────────────────────────────────────────

  /**
   * Load and validate a persona by slug.
   */
  private async loadPersona(slug: string): Promise<PersonaDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const persona = await this.personasService.findOne({
      isDarkroomCharacter: true,
      isDeleted: false,
      slug,
    });

    if (!persona) {
      this.loggerService.warn(caller, {
        message: `Persona not found: ${slug}`,
      });
      throw new NotFoundException(`Persona with slug "${slug}" not found`);
    }

    this.loggerService.log(caller, {
      label: persona.label,
      loraStatus: persona.loraStatus,
      slug,
    });

    return persona;
  }

  /**
   * Validate and filter platforms to supported ones.
   */
  private validatePlatforms(platforms: string[]): AiInfluencerPlatform[] {
    const valid = platforms.filter((p): p is AiInfluencerPlatform =>
      SUPPORTED_PLATFORMS.includes(p as AiInfluencerPlatform),
    );

    if (valid.length === 0) {
      throw new Error(
        `No supported platforms provided. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`,
      );
    }

    return valid;
  }

  /**
   * Generate a caption using the persona's voice, topics, and content strategy.
   */
  async generateCaption(persona: PersonaDocument): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { personaSlug: persona.slug });

    const strategy = this.readPersonaStrategy(persona);
    const personaRecord = persona as Record<string, unknown>;
    const topics = strategy.topics ?? [];
    const tone = strategy.tone ?? 'engaging and authentic';
    const niche = this.readString(personaRecord.niche) ?? 'lifestyle';
    const name = persona.label;
    const bio = this.readString(personaRecord.bio) ?? '';

    const systemPrompt = [
      `You are a social media caption writer for an AI influencer named "${name}".`,
      bio ? `Bio: ${bio}` : '',
      `Niche: ${niche}`,
      `Tone: ${tone}`,
      topics.length > 0 ? `Topics to cover: ${topics.join(', ')}` : '',
      '',
      'Write a single Instagram/Twitter caption for a new photo post.',
      'Requirements:',
      '- Be authentic and engaging',
      '- Include 3-5 relevant hashtags at the end',
      '- Keep it under 280 characters for Twitter compatibility',
      '- Do NOT include any URLs or links',
      '- Do NOT use emojis excessively (1-2 max)',
      '- Write ONLY the caption text, nothing else',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await this.openRouterService.chatCompletion({
        max_tokens: 300,
        messages: [
          { content: systemPrompt, role: 'system' },
          {
            content:
              "Write a fresh caption for today's post. Be creative and vary the style.",
            role: 'user',
          },
        ],
        model: CAPTION_MODEL,
        temperature: CAPTION_TEMPERATURE,
      });

      const caption = response.choices?.[0]?.message?.content?.trim() ?? '';

      if (!caption) {
        throw new Error('LLM returned empty caption');
      }

      // Truncate to Instagram limit if needed
      const truncated =
        caption.length > MAX_CAPTION_LENGTH
          ? caption.slice(0, MAX_CAPTION_LENGTH - 3) + '...'
          : caption;

      this.loggerService.log(caller, {
        captionLength: truncated.length,
        message: 'Caption generated successfully',
      });

      return truncated;
    } catch (error) {
      this.loggerService.error(caller, {
        error: error instanceof Error ? error.message : String(error),
        message: 'Caption generation failed',
      });
      throw error;
    }
  }

  /**
   * Build image generation configuration from persona and options.
   */
  private buildImageConfig(
    persona: PersonaDocument,
    options?: {
      promptOverride?: string;
      aspectRatio?: string;
    },
  ): ImageGenerationConfig {
    const triggerWord = persona.triggerWord ?? persona.slug ?? '';
    const niche = persona.niche ?? 'lifestyle';

    // Build prompt: use override or auto-generate
    const prompt =
      options?.promptOverride ??
      `A photo of ${triggerWord}, ${niche} influencer, high quality professional photography, natural lighting, social media style`;

    // Parse aspect ratio
    let width = DEFAULT_IMAGE_WIDTH;
    let height = DEFAULT_IMAGE_HEIGHT;

    if (options?.aspectRatio) {
      const [w, h] = options.aspectRatio.split(':').map(Number);
      if (w && h) {
        const scale = DEFAULT_IMAGE_WIDTH / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      }
    }

    // Use LoRA if available
    const loraPath = this.hasReadyLora(persona)
      ? this.readString((persona as Record<string, unknown>).loraModelPath)
      : undefined;

    return { height, loraPath, prompt, width };
  }

  /**
   * Generate an image via fal.ai.
   */
  private async generateImage(config: ImageGenerationConfig): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      hasLora: Boolean(config.loraPath),
      prompt: config.prompt.slice(0, 80),
    });

    const input: Record<string, unknown> = {
      image_size: {
        height: config.height,
        width: config.width,
      },
      num_images: 1,
      prompt: config.prompt,
    };

    if (config.loraPath) {
      input.loras = [
        {
          path: config.loraPath,
          scale: 0.8,
        },
      ];
    }

    const result = await this.falService.generateImage(IMAGE_MODEL, input);

    this.loggerService.log(caller, {
      message: 'Image generated successfully',
      url: result.url.slice(0, 80),
    });

    return result.url;
  }

  /**
   * Create an ingredient record for the generated image.
   */
  private async createIngredientRecord(
    persona: PersonaDocument,
    imageUrl: string,
    caption: string,
  ): Promise<IngredientDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const ingredient = await this.ingredientsService.create({
      brand: persona.brand,
      caption,
      cdnUrl: imageUrl,
      generationSource: `ai-influencer-${persona.slug}`,
      isDeleted: false,
      organization: persona.organization,
      persona: persona._id,
      personaSlug: persona.slug,
      reviewStatus: DarkroomReviewStatus.APPROVED,
      status: IngredientStatus.GENERATED,
      user: persona.user,
    } as Parameters<IngredientsService['create']>[0]);

    this.loggerService.log(caller, {
      ingredientId: ingredient._id.toString(),
      message: 'Ingredient record created',
    });

    return ingredient;
  }

  /**
   * Publish to all requested platforms, collecting results.
   */
  private async publishToAllPlatforms(
    platforms: AiInfluencerPlatform[],
    imageUrl: string,
    caption: string,
    persona: PersonaDocument,
    videoqueryResults?: {
      voiceResult: GenerationResult;
      videoResult: GenerationResult;
    },
  ): Promise<PlatformPublishResult[]> {
    const results: PlatformPublishResult[] = [];

    for (const platform of platforms) {
      const result = await this.publishToPlatform(
        platform,
        imageUrl,
        caption,
        persona,
        videoqueryResults,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Publish to a single platform.
   */
  private async publishToPlatform(
    platform: AiInfluencerPlatform,
    imageUrl: string,
    caption: string,
    persona: PersonaDocument,
    videoqueryResults?: {
      voiceResult: GenerationResult;
      videoResult: GenerationResult;
    },
  ): Promise<PlatformPublishResult> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const organizationId = this.readRequiredPersonaReference(
        persona,
        'organization',
      );
      const brandId = this.readRequiredPersonaReference(persona, 'brand');

      switch (platform) {
        case 'instagram': {
          const igResult = await this.instagramService.uploadImage(
            organizationId,
            brandId,
            imageUrl,
            caption,
          );
          this.loggerService.log(caller, {
            mediaId: igResult.mediaId,
            message: 'Published to Instagram',
          });
          return {
            externalId: igResult.mediaId,
            platform: 'instagram',
            status: 'published',
            success: true,
          };
        }

        case 'twitter': {
          const tweetId = await this.twitterService.uploadMedia(
            organizationId,
            brandId,
            imageUrl,
            caption,
            'image/jpeg',
          );
          this.loggerService.log(caller, {
            message: 'Published to Twitter',
            tweetId,
          });
          return {
            externalId: tweetId,
            platform: 'twitter',
            status: 'published',
            success: true,
          };
        }

        case 'tiktok':
        case 'youtube': {
          if (!videoqueryResults) {
            return {
              error: `Video pipeline was not prepared for ${platform}`,
              platform,
              status: 'failed',
              success: false,
            };
          }

          const { videoResult } = videoqueryResults;
          if (videoResult.status === 'failed') {
            return {
              error: `Video generation failed for ${platform}`,
              platform,
              status: 'failed',
              success: false,
            };
          }

          this.loggerService.log(caller, {
            message: `Queued video pipeline for ${platform}`,
            personaSlug: persona.slug,
            provider: videoResult.provider,
            videoJobId: videoResult.jobId,
          });

          return {
            externalId: videoResult.jobId ?? videoResult.url,
            platform,
            status: videoResult.status === 'completed' ? 'published' : 'queued',
            success: true,
          };
        }

        default:
          return {
            error: `Unsupported platform: ${platform as string}`,
            platform,
            status: 'failed',
            success: false,
          };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.loggerService.error(caller, {
        error: errorMessage,
        message: `Failed to publish to ${platform}`,
        personaSlug: persona.slug,
      });
      return {
        error: errorMessage,
        platform,
        status: 'failed',
        success: false,
      };
    }
  }

  private requiresVideoquery(platforms: AiInfluencerPlatform[]): boolean {
    return platforms.includes('tiktok') || platforms.includes('youtube');
  }

  private async generateVideoquery(
    persona: PersonaDocument,
    script: string,
    ingredientId: string,
  ): Promise<{
    voiceResult: GenerationResult;
    videoResult: GenerationResult;
  }> {
    const organizationId = this.readRequiredPersonaReference(
      persona,
      'organization',
    );
    const userId = this.readRequiredPersonaReference(persona, 'user');

    const voiceResult = await this.personaContentService.generateVoice({
      ingredientId,
      organization: organizationId,
      personaId: persona._id,
      text: script,
      user: userId,
    });

    const videoResult = await this.personaContentService.generateVideo({
      aspectRatio: '9:16',
      organization: organizationId,
      personaId: persona._id,
      script,
      user: userId,
    });

    return { videoResult, voiceResult };
  }
}
