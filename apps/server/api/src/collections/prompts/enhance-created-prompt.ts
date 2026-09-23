import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptEnhancementService } from '@api/services/prompt-enhancement/prompt-enhancement.service';
import { PromptStatus, Status } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';

type EnhanceCreatedPromptDeps = {
  creditsUtilsService: CreditsUtilsService;
  loggerService: LoggerService;
  promptEnhancementService: PromptEnhancementService;
  promptsService: PromptsService;
  websocketService: NotificationsPublisherService;
};

type EnhanceCreatedPromptInput = {
  contentType?: 'image' | 'video';
  brandId: string | null | undefined;
  chargedCredits: number;
  organizationId: string;
  promptId: string;
  requestedSkillSlugs: string[] | undefined;
  systemPromptKey: string;
  url: string;
  userId: string;
  userPrompt: string;
};

export async function enhanceCreatedPrompt(
  deps: EnhanceCreatedPromptDeps,
  input: EnhanceCreatedPromptInput,
): Promise<void> {
  try {
    const { result } = await deps.promptEnhancementService.enhance({
      brandId: input.brandId,
      contentType: input.contentType,
      organizationId: input.organizationId,
      requestedSkillSlugs: input.requestedSkillSlugs,
      systemPromptKey: input.systemPromptKey,
      userPrompt: input.userPrompt,
    });
    deps.loggerService.log(`${input.url} succeeded`);
    await deps.promptsService.patch(input.promptId, {
      enhanced: result,
      status: PromptStatus.GENERATED,
    });
    await deps.websocketService.emit(WebSocketPaths.prompt(input.promptId), {
      result,
      status: Status.COMPLETED,
    });
  } catch (error: unknown) {
    deps.loggerService.error(`${input.url} failed`, error);
    try {
      const refundExpiresAt = new Date();
      refundExpiresAt.setFullYear(refundExpiresAt.getFullYear() + 1);
      await deps.creditsUtilsService.refundOrganizationCredits(
        input.organizationId,
        input.chargedCredits,
        'prompt-creation-refund',
        'Prompt creation failed - credit refund',
        refundExpiresAt,
      );
      deps.loggerService.log('Credits refunded successfully', {
        amount: input.chargedCredits,
        organizationId: input.organizationId,
        userId: input.userId,
      });
    } catch (refundError: unknown) {
      deps.loggerService.error('Failed to refund credits', {
        error: refundError,
        organizationId: input.organizationId,
        userId: input.userId,
      });
    }
    await deps.promptsService.patch(input.promptId, {
      status: PromptStatus.FAILED,
    });
    await deps.websocketService.emit(WebSocketPaths.prompt(input.promptId), {
      error: (error as Error)?.message || 'An error occurred',
      status: Status.FAILED,
    });
  }
}
