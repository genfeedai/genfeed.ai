import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';
import { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';
import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';
import { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';
import { UpdateProfileDto } from '@api/collections/profiles/dto/update-profile.dto';
import {
  type IArticleProfile,
  type IImageProfile,
  type IVideoProfile,
  type IVoiceProfile,
  Profile,
  type ProfileDocument,
} from '@api/collections/profiles/schemas/profile.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { QueryBuilder } from '@api/helpers/utils/query-builder.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name, DB_CONNECTIONS.AUTH)
    private profileModel: Model<ProfileDocument>,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

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
      await this.profileModel.updateMany(
        { isDefault: true, organization: organizationId },
        { $set: { isDefault: false } },
      );
    }

    const profile = new this.profileModel({
      ...dto,
      createdBy: userId,
      organization: organizationId,
    });

    await profile.save();

    this.logger.debug('Profile created', { profileId: profile._id });

    return profile.toObject();
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
    const queryBuilder = new QueryBuilder(organizationId);

    queryBuilder
      .addBooleanFilter('isDefault', filters?.isDefault)
      .addTextSearch(filters?.search);

    const query = queryBuilder.build();

    return await this.profileModel.find(query).sort({ createdAt: -1 }).lean();
  }

  /**
   * Find one profile
   */
  async findOne(id: string, organizationId: string): Promise<Profile> {
    const queryBuilder = new QueryBuilder(organizationId);
    queryBuilder.addFilter('_id', id);

    const profile = await this.profileModel
      .findOne(queryBuilder.build())
      .lean();

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  /**
   * Get default profile
   */
  async getDefault(organizationId: string): Promise<Profile | null> {
    return await this.profileModel
      .findOne({
        isDefault: true,
        isDeleted: false,
        organization: organizationId,
      })
      .lean();
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
      await this.profileModel.updateMany(
        { _id: { $ne: id }, isDefault: true, organization: organizationId },
        { $set: { isDefault: false } },
      );
    }

    const profile = await this.profileModel.findOneAndUpdate(
      { _id: id, isDeleted: false, organization: organizationId },
      { $set: dto },
      { returnDocument: 'after' },
    );

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile.toObject();
  }

  /**
   * Delete profile
   */
  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.profileModel.updateOne(
      { _id: id, isDeleted: false, organization: organizationId },
      { $set: { isDeleted: true } },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Profile not found');
    }
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

      // Get profile
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

      // Enhance prompt with profile
      const enhanced = await this.enhancePromptWithProfile(
        dto.prompt,
        dto.contentType,
        profile,
        onBilling,
      );

      // Track usage
      await this.profileModel.updateOne(
        { _id: (profile as unknown as { _id: unknown })._id },
        { $inc: { usageCount: 1 } },
      );

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

      const result = await this.performToneAnalysis(
        dto.content,
        dto.contentType,
        profile,
        onBilling,
      );

      return result;
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

      // Analyze examples with AI
      const profileData = await this.analyzeExamples(dto.examples, onBilling);

      // Create profile
      const profile = await this.create(
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

      return profile;
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
      return prompt; // No profile for this content type
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

Return ONLY valid JSON with this structure. Do not include any text before or after the JSON:
{
  "score": 85,
  "violations": [
    {
      "severity": "medium",
      "category": "tone",
      "message": "Content uses formal tone instead of conversational",
      "suggestion": "Use more casual language: 'Hey there!' instead of 'Greetings'"
    }
  ],
  "summary": "Content mostly aligns with brand profile with minor tone adjustments needed"
}

Score 0-100. Higher is better.`;

    const input = {
      max_completion_tokens: 1024,
      prompt: analyzePrompt,
    };
    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, response));

    const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
      response,
      {},
    );

    return {
      score: result.score || 0,
      summary: result.summary || 'Analysis complete',
      violations: result.violations || [],
    };
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

Return ONLY valid JSON with profile definitions for each content type found. Do not include any text before or after the JSON:
{
  "image": {
    "style": "modern",
    "mood": ["professional", "energetic"],
    "colorPalette": {
      "primary": ["#0066FF"],
      "secondary": ["#00CCFF"],
      "neutral": ["#FFFFFF"]
    },
    "lighting": "dramatic",
    "composition": ["rule-of-thirds", "dynamic"]
  },
  "video": {
    "pacing": "fast",
    "energy": "high",
    "transitions": ["cut", "zoom"],
    "musicStyle": ["electronic", "upbeat"],
    "colorGrading": "vibrant",
    "aspectRatio": ["16:9", "9:16"]
  },
  "voice": {
    "personality": "enthusiastic",
    "pace": "fast",
    "emotion": ["excited", "confident"],
    "speakingStyle": "conversational"
  },
  "article": {
    "writingStyle": "conversational",
    "formality": "informal",
    "vocabulary": "moderate",
    "readingLevel": "high-school"
  }
}

Only include content types that are present in examples.`;

    const input = {
      max_completion_tokens: 2048,
      prompt,
    };
    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, response));

    const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
      response,
      {},
    );

    return {
      article: result.article,
      image: result.image,
      video: result.video,
      voice: result.voice,
    };
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
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
