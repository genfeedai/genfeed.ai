import {
  assembleStoryboardDraft,
  buildStoryboardDraftMessages,
  STORYBOARD_MIN_SHOTS,
  StoryboardDraftOutputError,
  type StoryboardDraftRequest,
  storyboardDraftOutputSchema,
  storyboardMaxShots,
} from '@api/collections/content-runs/services/storyboard-plan-draft';
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

@Injectable()
export class StoryboardPlanDraftService {
  constructor(
    private readonly openrouter: OpenRouterService,
    private readonly logger: LoggerService,
  ) {}

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
    try {
      const response = await this.openrouter.chatCompletion({
        model: LLM_DEFAULTS.background,
        max_tokens: 4096,
        messages: buildStoryboardDraftMessages(request),
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
}
