import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { PromptStatus, Status } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';

const PROMPT_ENHANCEMENT_MODEL = AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE;
const DEFAULT_TEXT_SYSTEM_PROMPT =
  'You are an expert AI assistant. Follow the instructions carefully and provide high-quality responses.';

type EnhanceCreatedPromptDeps = {
  creditsUtilsService: CreditsUtilsService;
  loggerService: LoggerService;
  openRouterService: OpenRouterService;
  promptsService: PromptsService;
  skillRuntimeService: SkillRuntimeService | undefined;
  templatesService: TemplatesService | undefined;
  websocketService: NotificationsPublisherService;
};

type EnhanceCreatedPromptInput = {
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
    const systemPromptPromise = deps.templatesService
      ? deps.templatesService
          .getRenderedPrompt(input.systemPromptKey, {}, input.organizationId)
          .catch(() => DEFAULT_TEXT_SYSTEM_PROMPT)
      : Promise.resolve(DEFAULT_TEXT_SYSTEM_PROMPT);
    const skillSections =
      (await deps.skillRuntimeService?.resolveRequestedSkillPromptSections(
        input.organizationId,
        input.brandId,
        input.requestedSkillSlugs,
      )) ?? '';
    const basePrompt = await systemPromptPromise;
    const systemPrompt = skillSections
      ? `${basePrompt}\n\n${skillSections}`
      : basePrompt;
    const response = await deps.openRouterService.chatCompletion({
      max_tokens: TEXT_GENERATION_LIMITS.promptEnhancement,
      messages: [
        { content: systemPrompt, role: 'system' },
        { content: input.userPrompt, role: 'user' },
      ],
      model: PROMPT_ENHANCEMENT_MODEL,
      temperature: 0.8,
    });
    const result = response.choices[0]?.message?.content?.trim() ?? '';
    deps.loggerService.log(`${input.url} succeeded`, { result });
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
