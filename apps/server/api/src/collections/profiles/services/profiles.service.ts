import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';
import { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';
import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';
import { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';
import { UpdateProfileDto } from '@api/collections/profiles/dto/update-profile.dto';
import type {
  IArticleProfile,
  IImageProfile,
  IVideoProfile,
  IVoiceProfile,
  ProfileDocument,
} from '@api/collections/profiles/schemas/profile.schema';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  BRAND_PROFILE_ANALYSIS_SCHEMA_NAME,
  BRAND_TONE_ANALYSIS_SCHEMA_NAME,
  brandProfileAnalysisSchema,
  brandToneAnalysisSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type { Prisma, Profile as ProfileRow } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

type Profile = ProfileDocument;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private serializeProfileData(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private normalizeProfile(record: ProfileRow): Profile {
    const data = this.readObjectRecord(record.data);
    const {
      id: _dataId,
      organizationId: _organizationId,
      createdById: _createdById,
      isDeleted: _isDeleted,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...safeData
    } = data as Record<string, unknown>;

    // Spread user-supplied data first, then canonical DB fields win — prevents
    // an attacker from injecting id, organizationId, or other system fields via
    // the stored data blob.
    return {
      ...record,
      ...safeData,
      id: record.id,
      organizationId: record.organizationId,
      createdById: record.createdById,
      isDeleted: record.isDeleted,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async unsetDefaultProfiles(
    organizationId: string,
    excludeId?: string,
  ) {
    const profiles = await this.prisma.profile.findMany({
      where: scopedWhere(organizationId, {
        data: { equals: true, path: ['isDefault'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      }),
    });

    await Promise.all(
      profiles.map((profile) =>
        this.prisma.profile.update({
          data: {
            data: this.serializeProfileData({
              ...this.readObjectRecord(profile.data),
              isDefault: false,
            }) as Prisma.InputJsonValue,
          },
          where: { id: profile.id },
        }),
      ),
    );
  }

  /**
   * Create a new profile
   */
  @HandleErrors('create profile', 'profiles')
  async create(
    dto: CreateProfileDto,
    organizationId: string,
    userId?: string,
  ): Promise<Profile> {
    this.logger.debug('Creating profile', {
      label: dto.label,
      organizationId,
    });

    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await this.unsetDefaultProfiles(organizationId);
    }

    const profile = await this.prisma.profile.create({
      data: {
        createdById: userId,
        data: this.serializeProfileData(
          dto as unknown as Record<string, unknown>,
        ) as Prisma.InputJsonValue,
        organizationId,
      },
    });

    this.logger.debug('Profile created', { profileId: profile.id });

    return this.normalizeProfile(profile);
  }

  /**
   * Find all profiles
   */
  async findAll(
    organizationId: string,
    filters?: {
      search?: string;
      isDefault?: boolean;
    },
  ): Promise<Profile[]> {
    const results = await this.prisma.profile.findMany({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(organizationId, {}),
    });

    return results
      .map((profile) => this.normalizeProfile(profile))
      .filter((profile) => {
        if (
          filters?.isDefault !== undefined &&
          Boolean(profile.isDefault) !== filters.isDefault
        ) {
          return false;
        }

        if (filters?.search) {
          const search = filters.search.toLowerCase();
          const haystack =
            `${profile.label ?? ''} ${profile.description ?? ''}`.toLowerCase();
          return haystack.includes(search);
        }

        return true;
      });
  }

  /**
   * Find one profile
   */
  async findOne(id: string, organizationId: string): Promise<Profile> {
    const profile = await findOrThrow(
      this.prisma.profile,
      { where: scopedWhere(organizationId, { id }) },
      'Profile',
    );

    return this.normalizeProfile(profile);
  }

  /**
   * Get default profile
   */
  async getDefault(organizationId: string): Promise<Profile | null> {
    const profile = await this.prisma.profile.findFirst({
      where: scopedWhere(organizationId, {
        data: { equals: true, path: ['isDefault'] },
      }),
    });

    return profile ? this.normalizeProfile(profile) : null;
  }

  /**
   * Update profile
   */
  async update(
    id: string,
    dto: UpdateProfileDto,
    organizationId: string,
  ): Promise<Profile> {
    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.unsetDefaultProfiles(organizationId, id);
    }

    const existing = await findOrThrow(
      this.prisma.profile,
      { where: scopedWhere(organizationId, { id }) },
      'Profile',
    );

    const result = await this.prisma.profile.update({
      data: {
        data: this.serializeProfileData({
          ...this.readObjectRecord(existing.data),
          ...dto,
        }) as Prisma.InputJsonValue,
      },
      where: { id },
    });

    return this.normalizeProfile(result);
  }

  /**
   * Delete profile
   */
  async remove(id: string, organizationId: string): Promise<void> {
    await findOrThrow(
      this.prisma.profile,
      { where: scopedWhere(organizationId, { id }) },
      'Profile',
    );

    await this.prisma.profile.update({
      data: { isDeleted: true },
      where: { id },
    });
  }

  /**
   * Apply profile to a prompt
   */
  async applyProfile(
    dto: ApplyProfileDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    original: string;
    enhanced: string;
    profileUsed: Profile;
  }> {
    try {
      this.logger.debug('Applying profile to prompt', {
        contentType: dto.contentType,
        organizationId,
      });

      let profile: Profile | null;
      if (dto.profileId) {
        profile = await this.findOne(dto.profileId, organizationId);
      } else {
        profile = await this.getDefault(organizationId);
      }

      if (!profile) {
        throw new NotFoundException(
          'No profile specified and no default profile found',
        );
      }

      const enhanced = await this.enhancePromptWithProfile(
        dto.prompt,
        dto.contentType,
        profile,
        onBilling,
      );

      // Track usage — scope write predicate to org + soft-delete to prevent IDOR
      const nextUsageCount = (this.readNumber(profile.usageCount) ?? 0) + 1;
      await this.prisma.profile.updateMany({
        data: {
          data: this.serializeProfileData({
            ...this.readObjectRecord(profile.data),
            ...profile,
            usageCount: nextUsageCount,
          }) as Prisma.InputJsonValue,
        },
        where: scopedWhere(organizationId, {
          id: profile.id,
        }) as Prisma.ProfileWhereInput,
      });

      return {
        enhanced,
        original: dto.prompt,
        profileUsed: profile,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to apply profile', { error });
      throw error;
    }
  }

  /**
   * Analyze content for tone compliance
   */
  async analyzeTone(
    dto: AnalyzeToneDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    score: number;
    violations: Array<{
      severity: 'high' | 'medium' | 'low';
      category: string;
      message: string;
      suggestion: string;
    }>;
    summary: string;
  }> {
    try {
      this.logger.debug('Analyzing tone', {
        contentType: dto.contentType,
        organizationId,
        profileId: dto.profileId,
      });

      const profile = await this.findOne(dto.profileId, organizationId);

      return await this.performToneAnalysis(
        dto.content,
        dto.contentType,
        profile,
        onBilling,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to analyze tone', { error });
      throw error;
    }
  }

  /**
   * Generate profile from example content
   */
  async generateFromExamples(
    dto: GenerateFromExamplesDto,
    organizationId: string,
    userId?: string,
    onBilling?: (amount: number) => void,
  ): Promise<Profile> {
    try {
      this.logger.debug('Generating profile from examples', {
        exampleCount: dto.examples.length,
        label: dto.label,
        organizationId,
      });

      const profileData = await this.analyzeExamples(dto.examples, onBilling);

      return await this.create(
        {
          article: profileData.article as IArticleProfile,
          description: dto.description,
          image: profileData.image as IImageProfile,
          label: dto.label,
          video: profileData.video as IVideoProfile,
          voice: profileData.voice as IVoiceProfile,
        },
        organizationId,
        userId,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to generate profile from examples', { error });
      throw error;
    }
  }

  /**
   * Private: Enhance prompt with profile
   */
  private async enhancePromptWithProfile(
    prompt: string,
    contentType: 'image' | 'video' | 'voice' | 'article',
    profile: Profile,
    onBilling?: (amount: number) => void,
  ): Promise<string> {
    const profileSection = profile[contentType];

    if (!profileSection) {
      return prompt;
    }

    const profileDetails = JSON.stringify(profileSection, null, 2);

    const enhancePrompt = `Enhance this ${contentType} prompt by incorporating the brand's tone/style profile.

Original prompt: "${prompt}"

Brand profile for ${contentType}:
${profileDetails}

Return the enhanced prompt that incorporates the brand's style while maintaining the original intent. Return only the enhanced prompt, no explanation.`;

    const input = {
      max_completion_tokens: 2048,
      prompt: enhancePrompt,
    };
    const result = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, result));

    return result || prompt;
  }

  /**
   * Private: Perform tone analysis
   */
  private async performToneAnalysis(
    content: string,
    contentType: 'image' | 'video' | 'voice' | 'article',
    profile: Profile,
    onBilling?: (amount: number) => void,
  ): Promise<{
    score: number;
    violations: Array<{
      severity: 'high' | 'medium' | 'low';
      category: string;
      message: string;
      suggestion: string;
    }>;
    summary: string;
  }> {
    const profileSection = profile[contentType];

    if (!profileSection) {
      return {
        score: 100,
        summary: 'No profile defined for this content type',
        violations: [],
      };
    }

    const profileDetails = JSON.stringify(profileSection, null, 2);

    const analyzePrompt = `Analyze if this ${contentType} content matches the brand's tone/style profile.

Content: "${content}"

Brand profile for ${contentType}:
${profileDetails}

Score 0-100 — higher is better. Summarize the fit in one line, and list each
violation with its severity, category, what is wrong and how to fix it.`;

    return this.completeStructured(
      analyzePrompt,
      1024,
      brandToneAnalysisSchema,
      BRAND_TONE_ANALYSIS_SCHEMA_NAME,
      onBilling,
    );
  }

  /**
   * Private: Analyze examples to generate profile
   */
  private async analyzeExamples(
    examples: Array<{
      contentType: 'image' | 'video' | 'voice' | 'article';
      url?: string;
      content?: string;
    }>,
    onBilling?: (amount: number) => void,
  ): Promise<{
    image?: Record<string, unknown>;
    video?: Record<string, unknown>;
    voice?: Record<string, unknown>;
    article?: Record<string, unknown>;
  }> {
    const examplesList = examples
      .map(
        (ex, i) =>
          `${i + 1}. ${ex.contentType}: ${ex.content || ex.url || 'N/A'}`,
      )
      .join('\n');

    const prompt = `Analyze these content examples and create a brand tone/style profile.

Examples:
${examplesList}

Describe each content type present in the examples, leaving the others null:
- image: style, mood, colorPalette (primary/secondary/neutral), lighting, composition
- video: pacing, energy, transitions, musicStyle, colorGrading, aspectRatio
- voice: personality, pace, emotion, speakingStyle
- article: writingStyle, formality, vocabulary, readingLevel`;

    const result = await this.completeStructured(
      prompt,
      2048,
      brandProfileAnalysisSchema,
      BRAND_PROFILE_ANALYSIS_SCHEMA_NAME,
      onBilling,
    );

    return {
      article: result.article ?? undefined,
      image: result.image ?? undefined,
      video: result.video ?? undefined,
      voice: result.voice ?? undefined,
    };
  }

  /**
   * One schema-validated text completion on the default Replicate text model.
   * Replicate cannot enforce a schema, so the adapter carries it in the prompt
   * and validates the answer, repairing once before the typed error. Every
   * attempt is billed — a repair is a second prediction we paid for.
   */
  private async completeStructured<TResult>(
    prompt: string,
    maxCompletionTokens: number,
    schema: ZodType<TResult>,
    schemaName: string,
    onBilling?: (amount: number) => void,
  ): Promise<TResult> {
    return this.replicateService.generateStructuredTextSync(
      DEFAULT_TEXT_MODEL,
      {
        input: { max_completion_tokens: maxCompletionTokens },
        onAttempt: async (attemptInput, output) => {
          onBilling?.(
            await this.calculateDefaultTextCharge(attemptInput, output),
          );
        },
        prompt,
        schema,
        schemaName,
      },
    );
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return calculateEstimatedTextCredits(model, input, output);
  }
}
