import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { resolveEnhancePromptSystemPrompt } from '@api/endpoints/ai-actions/prompts/cinematic-enhancement';
import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { PromptCategory, SystemPromptKey } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import { Injectable, Optional } from '@nestjs/common';

export const PROMPT_ENHANCEMENT_MODEL =
  AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE;
const DEFAULT_TEXT_SYSTEM_PROMPT =
  'You are an expert AI assistant. Follow the instructions carefully and provide high-quality responses.';

export interface PromptEnhancementInput {
  organizationId: string;
  brandId?: string | null;
  userPrompt: string;
  systemPromptKey?: string;
  requestedSkillSlugs?: string[];
  model?: string;
  contentType?: 'image' | 'video';
}

/** Existing AiActions context assembly and BYOK credentials; never accepted from an HTTP DTO. */
export interface PromptEnhancementServerOptions {
  preparedSystemPrompt?: string;
  byokApiKey?: string;
}

export interface PromptEnhancementResult {
  result: string;
  tokensUsed: number;
  isByok: boolean;
}

export class PromptEnhancementResponseError extends Error {
  constructor() {
    super('Prompt enhancement returned an invalid response');
  }
}

@Injectable()
export class PromptEnhancementService {
  constructor(
    private readonly openRouter: OpenRouterService,
    @Optional() private readonly templates?: TemplatesService,
    @Optional() private readonly skills?: SkillRuntimeService,
  ) {}

  async enhance(
    input: PromptEnhancementInput,
    options?: PromptEnhancementServerOptions,
  ): Promise<PromptEnhancementResult> {
    const fallback = input.contentType
      ? resolveEnhancePromptSystemPrompt({
          category:
            input.contentType === 'image'
              ? PromptCategory.MODELS_PROMPT_IMAGE
              : PromptCategory.MODELS_PROMPT_VIDEO,
        })
      : DEFAULT_TEXT_SYSTEM_PROMPT;
    const templateKey = input.model
      ? PromptParser.getModelSystemPromptTemplateKey(input.model)
      : (input.systemPromptKey ?? SystemPromptKey.DEFAULT);
    const basePrompt =
      options?.preparedSystemPrompt ??
      ((
        await this.templates
          ?.getRenderedPrompt(templateKey, {}, input.organizationId)
          .catch(() => fallback)
      )?.trim() ||
        fallback);
    const skillSections =
      (await this.skills?.resolveRequestedSkillPromptSections(
        input.organizationId,
        input.brandId,
        input.requestedSkillSlugs,
      )) ?? '';
    const response = await this.openRouter.chatCompletion(
      {
        max_tokens: TEXT_GENERATION_LIMITS.promptEnhancement,
        messages: [
          {
            content: skillSections
              ? `${basePrompt}\n\n${skillSections}`
              : basePrompt,
            role: 'system',
          },
          { content: input.userPrompt, role: 'user' },
        ],
        model: PROMPT_ENHANCEMENT_MODEL,
        temperature: 0.8,
      },
      options?.byokApiKey,
    );
    const result = response.choices[0]?.message?.content?.trim() ?? '';
    if (!result || result.length > 8000)
      throw new PromptEnhancementResponseError();
    return {
      result,
      tokensUsed: response.usage?.total_tokens ?? 0,
      isByok: Boolean(options?.byokApiKey),
    };
  }
}
