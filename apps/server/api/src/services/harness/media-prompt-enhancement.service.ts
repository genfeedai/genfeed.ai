import { normalizeRequestedSkillSlugs } from '@api/collections/skills/utils/requested-skill-slugs.util';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { collectKnowledgeReceipts } from '@api/services/harness/harness-context-sources.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import {
  PromptEnhancementResponseError,
  PromptEnhancementService,
} from '@api/services/prompt-enhancement/prompt-enhancement.service';
import type {
  GenerationHarnessReceipt,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import {
  buildMediaPromptFromHarness,
  selectMediaKnowledgeSources,
} from '@genfeedai/harness';
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
  /** An explicit Knowledge pick; absent means automatic brand retrieval. */
  knowledgeSelection?: KnowledgeSelection;
}

function hasKnowledgeSelection(
  selection: KnowledgeSelection | undefined,
): selection is KnowledgeSelection {
  return Boolean(
    selection?.sourceIds?.length ||
      selection?.spaceIds?.length ||
      selection?.purposes?.length,
  );
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
    const knowledgeSelection = hasKnowledgeSelection(input.knowledgeSelection)
      ? input.knowledgeSelection
      : undefined;
    // An explicit Knowledge pick only reaches the prompt through enhancement,
    // so it turns enhancement on for this request unless the request itself
    // turned it off.
    const isEnabled =
      input.harness ?? (preferences.isEnabled || Boolean(knowledgeSelection));
    const source =
      input.harness !== undefined ||
      (knowledgeSelection && !preferences.isEnabled)
        ? 'request'
        : preferences.source;
    const receipt: GenerationHarnessReceipt = {
      originalPrompt: input.prompt,
      enhancedPrompt: input.prompt,
      brandId: input.brandId,
      status: 'skipped',
      source,
      appliedPacks: [],
    };
    if (!isEnabled) {
      if (requestedSkillSlugs?.length || knowledgeSelection)
        throw new BadRequestException(
          'Enable enhancement or remove selected skills and Knowledge before generating.',
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
        ...(knowledgeSelection ? { knowledgeSelection } : {}),
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
      const knowledgeReceipts = collectKnowledgeReceipts(
        selectMediaKnowledgeSources(brief),
      );
      stage = 'receipt';
      const loaded = await this.contentHarness.listLoadedPackVersions();
      return {
        ...receipt,
        enhancedPrompt,
        ...(knowledgeReceipts.length > 0 ? { knowledgeReceipts } : {}),
        status: 'applied',
        appliedPacks: loaded.filter((pack) =>
          brief.appliedPacks.includes(pack.id),
        ),
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof PromptEnhancementResponseError) stage = 'response';
      const failure = {
        contentType: input.contentType === 'video' ? 'video' : 'image',
        model: await this.promptEnhancement
          .resolveModel()
          .catch(() => 'unresolved'),
        stage,
        error: error instanceof Error ? error.message : String(error),
      };
      const message =
        'Media prompt enhancement failed; generating with original prompt';
      // A provider failure means the configured text model is unreachable:
      // an operator configuration problem, not a per-request hiccup.
      if (stage === 'provider') this.logger.error(message, undefined, failure);
      else this.logger.warn(message, failure);
      return { ...receipt, status: 'failed' };
    }
  }
}
