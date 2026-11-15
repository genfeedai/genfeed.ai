import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { ExternalServiceException } from '@api/helpers/exceptions/external/external-service.exception';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import {
  type TextByokDispatch,
  textDispatchApiKey,
} from '@api/services/byok/text-dispatch-byok.util';
import { VideoFrameSamplerService } from '@api/services/content-quality/video-frame-sampler.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/contracts';
import {
  buildPersuasionEvaluationRubric,
  normalizePersuasionScores,
} from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;

interface EvaluationContext {
  prompt?: string;
  /** Stored video duration; frame sampling probes the file only without it. */
  durationSeconds?: number;
  brand?: PromptBuilderParams['brand'];
  platform?: string;
  metadata?: unknown;
  label?: string;
  isThread?: boolean;
  threadLength?: number;
  previousEvaluation?: {
    overallScore: number;
    scores: {
      technical?: { overall?: number };
      brand?: { overall?: number };
      engagement?: { overall?: number };
    };
    updatedAt: Date;
  };
}

interface EvaluationConfig {
  promptTemplate: PromptTemplateKey;
  contentType: string;
  maxContentLength: number;
  imageUrls?: string[];
}

interface EvaluationResponsePayload {
  flags?: {
    isFlagged?: boolean;
    reasons?: string[];
    severity?: string;
  };
  overallScore?: number;
  scores?: {
    brand?: { overall?: number };
    engagement?: { overall?: number };
    /**
     * Raw, unvalidated persuasion object as returned by the evaluator.
     * Normalized/validated by `normalizePersuasionScores` before it is
     * allowed into the stored evaluation -- see `formatEvaluationResponse`.
     */
    persuasion?: unknown;
    technical?: { overall?: number };
  };
  strengths?: string[];
  suggestions?: string[];
  weaknesses?: string[];
}

/**
 * The evaluation model reads images, not video, so a video is evaluated from
 * frames sampled across its duration: first, last and three between, so the
 * middle of the video is always seen.
 */
const VIDEO_EVALUATION_FRAME_POSITIONS: readonly number[] = [
  0, 0.25, 0.5, 0.75, 1,
];

type EvaluationPromptOptions = PromptBuilderParams & {
  isThread?: boolean;
  label?: string;
  threadLength?: number;
};

@Traced()
@Injectable()
export class EvaluationsOperationsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly logger: LoggerService,
    private readonly videoFrameSampler: VideoFrameSamplerService,
  ) {}

  private toEvaluationResponsePayload(
    value: unknown,
  ): EvaluationResponsePayload {
    if (!value || typeof value !== 'object') {
      return {};
    }

    return value as EvaluationResponsePayload;
  }

  /**
   * Parse JSON from LLM response text
   * Handles both clean JSON and JSON embedded in text/markdown
   */
  private parseJsonResponse(output: string): unknown {
    try {
      return JSON.parse(output);
    } catch {
      const jsonMatch = output.match(JSON_OBJECT_PATTERN);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          this.logger.warn('Could not parse extracted JSON', {
            extracted: jsonMatch[0].substring(0, 200),
          });
        }
      }
      throw new Error('Could not parse JSON from LLM response');
    }
  }

  /**
   * Core evaluation method that handles all content types
   */
  private async evaluate(
    content: string,
    context: EvaluationContext,
    organizationId: string,
    config: EvaluationConfig,
    onBilling?: (amount: number) => void,
    byok?: TextByokDispatch,
  ): Promise<unknown> {
    this.logger.log(
      `Evaluating ${config.contentType} content`,
      this.constructorName,
    );

    try {
      const truncatedContent =
        content.length > config.maxContentLength
          ? `${content.substring(0, config.maxContentLength)}...`
          : content;

      const promptOptions: EvaluationPromptOptions = {
        brand: context.brand,
        maxTokens: (await this.platformSettingsService.getFeatureSettings())
          .generationMaxTokens,
        modelCategory: ModelCategory.TEXT,
        prompt: truncatedContent,
        promptTemplate: config.promptTemplate,
        systemPromptTemplate: SystemPromptKey.EVALUATION,
        systemPromptSuffix: buildPersuasionEvaluationRubric(),
        temperature: 0.1,
        topP: 0.5,
      };

      // Add post-specific options
      if (context.label) {
        promptOptions.label = context.label;
      }
      if (context.isThread !== undefined) {
        promptOptions.isThread = context.isThread;
      }
      if (context.threadLength) {
        promptOptions.threadLength = context.threadLength;
      }

      const { input } = (await this.promptBuilderService.buildPrompt(
        DEFAULT_TEXT_MODEL,
        promptOptions,
        organizationId,
      )) || { input: {} };

      const finalInput = config.imageUrls?.length
        ? { ...input, images: config.imageUrls }
        : input;

      const responseText =
        await this.replicateService.generateTextCompletionSync(
          DEFAULT_TEXT_MODEL,
          finalInput,
          textDispatchApiKey(byok, DEFAULT_TEXT_MODEL),
        );

      if (!responseText) {
        throw new Error('Failed to evaluate content from AI service');
      }

      // A BYOK evaluation ran on the org's own key: nothing to bill.
      if (!byok) {
        onBilling?.(
          await this.calculateDefaultTextCharge(finalInput, responseText),
        );
      }

      const response = this.parseJsonResponse(responseText);
      return this.formatEvaluationResponse(response, DEFAULT_TEXT_MODEL);
    } catch (error: unknown) {
      this.logger.error(`${config.contentType} evaluation failed`, { error });
      throw new ExternalServiceException(
        'Replicate',
        `${config.contentType} evaluation failed`,
        error,
      );
    }
  }

  async evaluateVideo(
    videoUrl: string,
    context: EvaluationContext = {},
    organizationId: string,
    onBilling?: (amount: number) => void,
    byok?: TextByokDispatch,
  ): Promise<unknown> {
    // Frames are extracted and stored through the files service's S3 path, and
    // the model provider must fetch them from a public CDN. Self-hosted media
    // lives in local storage, so no frame can reach the provider.
    if (isSelfHostedDeployment()) {
      throw new BadRequestException(
        'Video evaluation needs cloud media storage; this deployment stores media locally.',
      );
    }
    const sample = await this.videoFrameSampler.sample(
      videoUrl,
      VIDEO_EVALUATION_FRAME_POSITIONS,
      context.durationSeconds,
    );
    try {
      return await this.evaluate(
        context.prompt || 'No context provided',
        context,
        organizationId,
        {
          contentType: 'Video',
          imageUrls: sample.frames.map((frame) => frame.url),
          maxContentLength: 4000,
          promptTemplate: PromptTemplateKey.EVALUATION_VIDEO,
        },
        onBilling,
        byok,
      );
    } finally {
      await sample.cleanup();
    }
  }

  evaluateImage(
    imageUrl: string,
    context: EvaluationContext = {},
    organizationId: string,
    onBilling?: (amount: number) => void,
    byok?: TextByokDispatch,
  ): Promise<unknown> {
    return this.evaluate(
      context.prompt || 'No context provided',
      context,
      organizationId,
      {
        contentType: 'Image',
        imageUrls: [imageUrl],
        maxContentLength: 4000,
        promptTemplate: PromptTemplateKey.EVALUATION_IMAGE,
      },
      onBilling,
      byok,
    );
  }

  evaluateArticle(
    articleContent: string,
    context: EvaluationContext = {},
    organizationId: string,
    onBilling?: (amount: number) => void,
    byok?: TextByokDispatch,
  ): Promise<unknown> {
    return this.evaluate(
      articleContent,
      context,
      organizationId,
      {
        contentType: 'Article',
        maxContentLength: 3000,
        promptTemplate: PromptTemplateKey.EVALUATION_ARTICLE,
      },
      onBilling,
      byok,
    );
  }

  evaluatePost(
    postContent: string,
    context: EvaluationContext = {},
    organizationId: string,
    onBilling?: (amount: number) => void,
    byok?: TextByokDispatch,
  ): Promise<unknown> {
    let content = postContent;

    // Add previous evaluation context for consistency
    if (context.previousEvaluation) {
      content = `${postContent}

---
PREVIOUS EVALUATION REFERENCE (use as anchor for consistency, adjust only if content changed):
Overall Score: ${context.previousEvaluation.overallScore}
Technical: ${context.previousEvaluation.scores?.technical?.overall || 'N/A'}
Brand: ${context.previousEvaluation.scores?.brand?.overall || 'N/A'}
Engagement: ${context.previousEvaluation.scores?.engagement?.overall || 'N/A'}
---`;
    }

    return this.evaluate(
      content,
      context,
      organizationId,
      {
        contentType: 'Post',
        maxContentLength: 4000,
        promptTemplate: PromptTemplateKey.EVALUATION_POST,
      },
      onBilling,
      byok,
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

  /**
   * Format AI response into evaluation structure
   */
  private formatEvaluationResponse(
    aiResponse: unknown,
    model: string,
  ): unknown {
    const response = this.toEvaluationResponsePayload(aiResponse);
    const { persuasion: rawPersuasion, ...otherScores } = response.scores ?? {};
    const persuasion = normalizePersuasionScores(rawPersuasion);

    return {
      analysis: {
        aiModel: model,
        strengths: response.strengths || [],
        suggestions: response.suggestions || [],
        weaknesses: response.weaknesses || [],
      },
      flags: response.flags || {
        isFlagged: false,
        reasons: [],
        severity: 'info',
      },
      overallScore: response.overallScore || 0,
      scores: response.scores
        ? { ...otherScores, ...(persuasion ? { persuasion } : {}) }
        : {
            brand: { overall: 0 },
            engagement: { overall: 0 },
            technical: { overall: 0 },
          },
    };
  }
}
