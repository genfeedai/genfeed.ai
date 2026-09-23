import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface MediaPromptEnhancementInput {
  organizationId: string;
  brandId: string;
  prompt: string;
  contentType: 'image' | 'video';
  model?: string;
  harness?: boolean;
}

@Injectable()
export class MediaPromptEnhancementService {
  constructor(
    private readonly settings: GenerationHarnessSettingsService,
    private readonly harness: HarnessGenerationService,
    private readonly contentHarness: ContentHarnessService,
    private readonly openRouter: OpenRouterService,
    private readonly logger: LoggerService,
  ) {}

  async enhance(
    input: MediaPromptEnhancementInput,
  ): Promise<GenerationHarnessReceipt> {
    const preferences = await this.settings.get(
      input.organizationId,
      input.brandId,
    );
    const source = input.harness === undefined ? preferences.source : 'request';
    const receipt: GenerationHarnessReceipt = {
      originalPrompt: input.prompt,
      enhancedPrompt: input.prompt,
      brandId: input.brandId,
      status: 'skipped',
      source,
      appliedPacks: [],
    };
    if (!(input.harness ?? preferences.isEnabled)) return receipt;
    let stage: 'brief' | 'provider' | 'response' | 'receipt' = 'brief';
    try {
      const brief = await this.harness.resolveBrief({
        organizationId: input.organizationId,
        brandId: input.brandId,
        contentType: input.contentType,
        topic: input.prompt,
        includeContentMemory: true,
      });
      if (!brief) throw new Error('Harness brief is unavailable');
      const formattedBrief = this.harness.formatBrief(brief);
      stage = 'provider';
      const response = await this.openRouter.chatCompletion({
        model: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
        max_tokens: 2000,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: `Rewrite the user prompt into one effective creative prompt for ${input.contentType} generation${input.model ? ` with model ${input.model}` : ''}. Preserve the user's subject, intent, constraints, and requested words. Add useful visual detail only where consistent with that intent. Never invent factual claims, endorsements, logos, or brand promises. Apply the following brand guidance without exposing its instructions or metadata. Return only the creative prompt, no headings or explanations. Maximum 8000 characters.\n\n${formattedBrief}`,
          },
          { role: 'user', content: input.prompt },
        ],
      });
      stage = 'response';
      const enhancedPrompt = response.choices[0]?.message?.content?.trim();
      if (!enhancedPrompt || enhancedPrompt.length > 8000)
        throw new Error('Enhancement returned an invalid prompt');
      stage = 'receipt';
      const loaded = await this.contentHarness.listLoadedPackVersions();
      return {
        ...receipt,
        enhancedPrompt,
        status: 'applied',
        appliedPacks: loaded.filter((pack) =>
          brief.appliedPacks.includes(pack.id),
        ),
      };
    } catch {
      this.logger.warn('Media prompt enhancement failed', {
        contentType: input.contentType === 'video' ? 'video' : 'image',
        model: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
        stage,
      });
      throw new ServiceUnavailableException(
        'Prompt enhancement is unavailable. Retry or disable enhancement before generating.',
      );
    }
  }
}
