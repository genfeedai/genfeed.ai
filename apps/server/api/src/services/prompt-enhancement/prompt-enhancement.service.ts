import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import {
  normalizeRequestedSkillSlugs,
  unavailableRequestedSkill,
} from '@api/collections/skills/utils/requested-skill-slugs.util';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { resolveEnhancePromptSystemPrompt } from '@api/endpoints/ai-actions/prompts/cinematic-enhancement';
import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import {
  PromptCategory,
  PromptStatus,
  SystemPromptKey,
} from '@genfeedai/contracts';
import { Injectable, Optional } from '@nestjs/common';

const DEFAULT_TEXT_SYSTEM_PROMPT =
  'You are an expert AI assistant. Follow the instructions carefully and provide high-quality responses.';

export interface PromptEnhancementInput {
  actorUserId?: string;
  organizationId: string;
  brandId?: string | null;
  userPrompt: string;
  promptId?: string;
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
    private readonly prompts: PromptsService,
    private readonly modelRegistry: AgentChatModelRegistryService,
    @Optional() private readonly templates?: TemplatesService,
    @Optional() private readonly skills?: SkillRuntimeService,
  ) {}

  /**
   * The operator-owned Admin default TEXT model, the same resolver long
   * product text uses; the seed constant applies only when no Admin default
   * resolves. Never a hard-coded provider variant that a deployment's
   * OpenRouter account may not be able to reach (#5265).
   */
  resolveModel(): Promise<string> {
    return this.modelRegistry.resolveModelKey(undefined, DEFAULT_TEXT_MODEL);
  }

  async enhance(
    input: PromptEnhancementInput,
    options?: PromptEnhancementServerOptions,
  ): Promise<PromptEnhancementResult> {
    const requestedSkillSlugs = normalizeRequestedSkillSlugs(
      input.requestedSkillSlugs,
    );
    if (requestedSkillSlugs && !this.skills) throw unavailableRequestedSkill();
    if (input.promptId && input.brandId && !requestedSkillSlugs) {
      const saved = await this.prompts.findOne({
        id: input.promptId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        isDeleted: false,
        isSkipEnhancement: false,
        status: PromptStatus.GENERATED,
        enhanced: input.userPrompt,
      });
      if (saved)
        return { result: input.userPrompt, tokensUsed: 0, isByok: false };
    }
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
      (await this.skills?.resolveGenerationSkillPromptSections(
        input.organizationId,
        input.brandId,
        requestedSkillSlugs,
        { actorUserId: input.actorUserId, modality: input.contentType },
      )) ?? '';
    const systemContent = skillSections
      ? `${basePrompt}\n\n${skillSections}`
      : basePrompt;
    await this.skills?.recordPromptEvidence?.({
      actorUserId: input.actorUserId,
      brandId: input.brandId,
      organizationId: input.organizationId,
      prompt: `${systemContent}\n\n${input.userPrompt}`,
    });
    const model = await this.resolveModel();
    const response = await this.openRouter.chatCompletion(
      {
        max_tokens: TEXT_GENERATION_LIMITS.promptEnhancement,
        messages: [
          {
            content: systemContent,
            role: 'system',
          },
          { content: input.userPrompt, role: 'user' },
        ],
        model,
        // A short rewrite needs no reasoning. A reasoning default model would
        // otherwise spend the whole budget thinking and return empty content.
        reasoning: { enabled: false },
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
