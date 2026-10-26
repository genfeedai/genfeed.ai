import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { ScriptGenerationRequest } from '@api/services/script-generation/script-generation.interface';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export const SCRIPT_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context is unavailable for this script. Please retry.';

const SCRIPT_SYSTEM_PROMPT =
  'You are a senior short-form video scriptwriter. Write the spoken script and the on-screen beats in plain text. Follow the brand brief exactly; never contradict its guardrails, and do not invent claims it does not support.';

/**
 * Scripts are written against the composed harness brief (org directive, brand
 * voice, guardrails, criteria, examples), like the other copy kinds. A script
 * is never written without it: an unresolved brief fails the request instead of
 * letting a generic script through.
 */
@Injectable()
export class ScriptGenerationService {
  constructor(
    private readonly harness: HarnessGenerationService,
    private readonly llm: LlmDispatcherService,
    private readonly logger: LoggerService,
  ) {}

  async generate(request: ScriptGenerationRequest): Promise<string> {
    const brief = await this.harness.resolveBrief({
      brandId: request.brandId,
      contentType: 'script',
      includeContentMemory: true,
      objective: 'retention',
      organizationId: request.organizationId,
      platform: request.platform,
      topic: request.topic,
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
      throw new ServiceUnavailableException(SCRIPT_BRAND_CONTEXT_UNAVAILABLE);
    }

    const completion = await this.llm.chatCompletion(
      {
        max_tokens: TEXT_GENERATION_LIMITS.scriptDraft,
        messages: [
          {
            content: `${SCRIPT_SYSTEM_PROMPT}\n\n${formattedBrief}`,
            role: 'system',
          },
          { content: buildScriptRequestPrompt(request), role: 'user' },
        ],
        model: request.model ?? LLM_DEFAULTS.fastText,
        temperature: 0.6,
      },
      request.organizationId,
    );
    return completion.choices[0]?.message?.content?.trim() ?? '';
  }
}

function buildScriptRequestPrompt(request: ScriptGenerationRequest): string {
  return [
    `Write a script about: ${request.topic}`,
    request.platform ? `Platform: ${request.platform}` : undefined,
    request.durationSeconds
      ? `Target length: about ${request.durationSeconds} seconds when spoken.`
      : undefined,
    request.instructions
      ? `Additional instructions: ${request.instructions}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}
