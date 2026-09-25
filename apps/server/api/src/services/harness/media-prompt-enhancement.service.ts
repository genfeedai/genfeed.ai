import { normalizeRequestedSkillSlugs } from '@api/collections/skills/utils/requested-skill-slugs.util';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import {
  PROMPT_ENHANCEMENT_MODEL,
  PromptEnhancementResponseError,
  PromptEnhancementService,
} from '@api/services/prompt-enhancement/prompt-enhancement.service';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';
import { buildMediaPromptFromHarness } from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface MediaPromptEnhancementInput {
  actorUserId?: string;
  organizationId: string;
  brandId: string;
  prompt: string;
  promptId?: string;
  requestedSkillSlugs?: string[];
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
    private readonly promptEnhancement: PromptEnhancementService,
    private readonly logger: LoggerService,
  ) {}

  async enhance(
    input: MediaPromptEnhancementInput,
  ): Promise<GenerationHarnessReceipt> {
    const requestedSkillSlugs = normalizeRequestedSkillSlugs(
      input.requestedSkillSlugs,
    );
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
    if (!(input.harness ?? preferences.isEnabled)) {
      if (requestedSkillSlugs?.length)
        throw new BadRequestException(
          'Enable enhancement or remove selected skills before generating.',
        );
      return receipt;
    }
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
      stage = 'provider';
      const { result } = await this.promptEnhancement.enhance({
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        userPrompt: input.prompt,
        promptId: input.promptId,
        ...(requestedSkillSlugs ? { requestedSkillSlugs } : {}),
        model: input.model,
        contentType: input.contentType,
      });
      stage = 'response';
      const enhancedPrompt = buildMediaPromptFromHarness(result, brief);
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
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof PromptEnhancementResponseError) stage = 'response';
      this.logger.warn(
        'Media prompt enhancement failed; generating with original prompt',
        {
          contentType: input.contentType === 'video' ? 'video' : 'image',
          model: PROMPT_ENHANCEMENT_MODEL,
          stage,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return { ...receipt, status: 'failed' };
    }
  }
}
