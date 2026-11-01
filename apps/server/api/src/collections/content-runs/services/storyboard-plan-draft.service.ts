import {
  assembleStoryboardLongFormDraft,
  buildStoryboardLongFormDraftMessages,
  type StoryboardLongFormDraftRequest,
  storyboardLongFormDraftOutputSchema,
} from '@api/collections/content-runs/services/storyboard-long-form-draft';
import {
  applyStoryboardLongFormTranslation,
  buildStoryboardLongFormTranslationMessages,
  type StoryboardLongFormTranslationRequest,
  storyboardLongFormTranslationOutputSchema,
} from '@api/collections/content-runs/services/storyboard-long-form-translation';
import {
  assembleStoryboardDraft,
  buildStoryboardDraftMessages,
  STORYBOARD_MIN_SHOTS,
  type StoryboardDraftActor,
  StoryboardDraftOutputError,
  type StoryboardDraftRequest,
  storyboardDraftOutputSchema,
  storyboardMaxShots,
} from '@api/collections/content-runs/services/storyboard-plan-draft';
import {
  assembleStoryboardSlideshowDraft,
  buildStoryboardSlideshowDraftMessages,
  type StoryboardSlideshowDraftRequest,
  storyboardSlideshowDraftOutputSchema,
} from '@api/collections/content-runs/services/storyboard-slideshow-draft';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';

const RETRYABLE_MESSAGE =
  'The storyboard draft could not be generated. Nothing was changed; try again.';

export const STORYBOARD_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context is unavailable for this storyboard. Nothing was changed; try again.';

@Injectable()
export class StoryboardPlanDraftService {
  constructor(
    private readonly harness: HarnessGenerationService,
    private readonly openrouter: OpenRouterService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * The composed harness brief (org directive, brand voice, guardrails,
   * criteria, examples) the plan is written against. A plan is never drafted
   * without it: a missing, empty or over-budget brief is a retryable 503
   * before any model call, and a brand access refusal passes through.
   */
  private async resolveHarnessBrief(
    request: StoryboardDraftActor & { brief: string },
    contentType: 'post' | 'video-script' = 'video-script',
  ): Promise<string> {
    const brief = await this.harness.resolveBrief({
      brandId: request.brandId,
      contentType,
      includeContentMemory: true,
      objective: 'retention',
      organizationId: request.organizationId,
      topic: request.brief,
      userId: request.userId,
    });
    const formattedBrief = this.harness.formatBrief(brief).trim();
    if (
      !brief ||
      !formattedBrief ||
      formattedBrief.length > BRAND_CONTEXT_CHARACTER_BUDGET
    ) {
      this.logger.warn(`${this.constructor.name} harness brief unavailable`, {
        brandId: request.brandId,
        organizationId: request.organizationId,
      });
      throw new ServiceUnavailableException(
        STORYBOARD_BRAND_CONTEXT_UNAVAILABLE,
      );
    }
    return formattedBrief;
  }

  /**
   * Ask the model for a plan and fit it to the video model's durations and the
   * runtime budget. Throws a retryable 503 when the model fails or answers with
   * something that cannot be a plan, so the caller never saves a partial result.
   */
  async draft(request: StoryboardDraftRequest): Promise<StoryboardPlan> {
    if (
      storyboardMaxShots(
        request.model.supportedDurationsSeconds,
        request.runtimeBudgetSeconds,
      ) < STORYBOARD_MIN_SHOTS
    )
      throw new ConflictException(
        'The runtime budget is too short for two shots with the selected video model. Increase the runtime budget.',
      );
    const harnessBrief = await this.resolveHarnessBrief(request);
    try {
      const response = await this.openrouter.chatCompletion({
        // First-party OpenRouter calls send `zdr: true`; the background
        // default (gemini-2.5-flash-lite) has no ZDR endpoint and 404s.
        // This model reasons by default, so leave headroom in max_tokens.
        model: LLM_DEFAULTS.productTextFallback,
        max_tokens: 8192,
        messages: buildStoryboardDraftMessages(request, harnessBrief),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'storyboard_plan_draft',
            strict: true,
            schema: z.toJSONSchema(storyboardDraftOutputSchema),
          },
        },
      });
      const output = storyboardDraftOutputSchema.parse(
        JSON.parse(response.choices[0]?.message.content ?? ''),
      );
      return assembleStoryboardDraft(request, output);
    } catch (error: unknown) {
      return this.fail(error);
    }
  }

  /**
   * Ask the model for a slideshow: ordered slide descriptions and the post
   * caption (#8896). Same retry contract as `draft`: nothing is saved on
   * failure.
   */
  async draftSlideshow(
    request: StoryboardSlideshowDraftRequest,
  ): Promise<StoryboardPlan> {
    const harnessBrief = await this.resolveHarnessBrief(request, 'post');
    try {
      const response = await this.openrouter.chatCompletion({
        model: LLM_DEFAULTS.productTextFallback,
        max_tokens: 8192,
        messages: buildStoryboardSlideshowDraftMessages(request, harnessBrief),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'storyboard_slideshow_draft',
            strict: true,
            schema: z.toJSONSchema(storyboardSlideshowDraftOutputSchema),
          },
        },
      });
      const output = storyboardSlideshowDraftOutputSchema.parse(
        JSON.parse(response.choices[0]?.message.content ?? ''),
      );
      return assembleStoryboardSlideshowDraft(request, output);
    } catch (error: unknown) {
      return this.fail(error);
    }
  }

  /**
   * Ask the model for a long-form script: narration segments with B-roll
   * cutaways over one presenter (#8218). Same retry contract as `draft`.
   */
  async draftLongForm(
    request: StoryboardLongFormDraftRequest,
  ): Promise<StoryboardPlan> {
    const harnessBrief = await this.resolveHarnessBrief(request);
    try {
      const response = await this.openrouter.chatCompletion({
        model: LLM_DEFAULTS.productTextFallback,
        // A ten minute script is about 7,000 characters of narration plus
        // cutaway briefs; leave headroom for reasoning.
        max_tokens: 32_768,
        messages: buildStoryboardLongFormDraftMessages(request, harnessBrief),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'storyboard_long_form_draft',
            strict: true,
            schema: z.toJSONSchema(storyboardLongFormDraftOutputSchema),
          },
        },
      });
      const output = storyboardLongFormDraftOutputSchema.parse(
        JSON.parse(response.choices[0]?.message.content ?? ''),
      );
      return assembleStoryboardLongFormDraft(request, output);
    } catch (error: unknown) {
      return this.fail(error);
    }
  }

  /**
   * Translate a long-form script line by line for a copy in another language
   * (#8226). Same retry contract as `draft`: nothing is saved on failure.
   */
  async translateLongForm(
    request: StoryboardLongFormTranslationRequest,
  ): Promise<StoryboardPlan> {
    try {
      const response = await this.openrouter.chatCompletion({
        model: LLM_DEFAULTS.productTextFallback,
        max_tokens: 32_768,
        messages: buildStoryboardLongFormTranslationMessages(request),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'storyboard_long_form_translation',
            strict: true,
            schema: z.toJSONSchema(storyboardLongFormTranslationOutputSchema),
          },
        },
      });
      const output = storyboardLongFormTranslationOutputSchema.parse(
        JSON.parse(response.choices[0]?.message.content ?? ''),
      );
      return applyStoryboardLongFormTranslation(request.plan, output);
    } catch (error: unknown) {
      return this.fail(error);
    }
  }

  private fail(error: unknown): never {
    if (error instanceof ConflictException) throw error;
    this.logger.error(
      'Storyboard plan draft failed',
      error,
      error instanceof StoryboardDraftOutputError ||
        error instanceof SyntaxError ||
        error instanceof z.ZodError
        ? { reason: 'invalid_output' }
        : { reason: 'provider_error' },
    );
    throw new ServiceUnavailableException(RETRYABLE_MESSAGE);
  }
}
