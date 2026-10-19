import { normalizeRequestedSkillSlugs } from '@api/collections/skills/utils/requested-skill-slugs.util';
import {
  MediaPromptBrandEnhancementException,
  type MediaPromptBrandEnhancementStage,
} from '@api/helpers/exceptions/media-prompt-brand-enhancement/media-prompt-brand-enhancement.exception';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { collectKnowledgeReceipts } from '@api/services/harness/harness-context-sources.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import {
  PromptEnhancementResponseError,
  PromptEnhancementService,
} from '@api/services/prompt-enhancement/prompt-enhancement.service';
import type {
  BrandIdentitySnapshotV1,
  GenerationBrandMode,
  GenerationHarnessReceipt,
  GenerationPromptAuthor,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import {
  buildMediaPromptFromHarness,
  type ContentHarnessBrief,
  selectMediaKnowledgeSources,
} from '@genfeedai/harness';
import { lockMediaUserPrompt } from '@genfeedai/helpers/brand/brand-offering.helper';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export interface MediaPromptEnhancementInput {
  actorUserId: string;
  isApiKey?: boolean;
  apiKeyId?: string;
  scopes?: string[];
  organizationId: string;
  brandId: string;
  prompt: string;
  promptId?: string;
  requestedSkillSlugs?: string[];
  contentType: 'image' | 'video';
  model?: string;
  harness?: boolean;
  /**
   * `raw` is the user's explicit opt-out: the prompt goes to the provider as
   * typed and no brand identity is resolved. Approved and provisional modes
   * are always resolved here, never supplied by a caller.
   */
  brandMode?: 'raw';
  /** Recorded on the receipt when the prompt came from an agent proposal. */
  promptAuthor?: GenerationPromptAuthor;
  /** An explicit Knowledge pick; absent means automatic brand retrieval. */
  knowledgeSelection?: KnowledgeSelection;
}

function brandOfferingCorpus(
  snapshot: BrandIdentitySnapshotV1,
  brief: ContentHarnessBrief,
  prompt: string,
): string {
  const identity = snapshot.identity;
  const voice = snapshot.voice;
  return [
    prompt,
    identity?.description,
    identity?.positioning,
    identity?.name,
    voice?.tone,
    voice?.style,
    ...(voice?.audience ?? []),
    ...(voice?.messagingPillars ?? []),
    ...brief.systemDirectives,
    ...brief.styleDirectives,
    ...brief.guardrails,
    ...brief.sources.map((source) => source.content),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
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
    private readonly modes: BrandedModeResolverService,
    private readonly snapshots: BrandIdentitySnapshotService,
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
    const isRaw = input.brandMode === 'raw';
    // An explicit Knowledge pick only reaches the prompt through enhancement,
    // so it turns enhancement on for this request unless the request itself
    // turned it off. A raw request never enhances.
    const isEnabled =
      !isRaw &&
      (input.harness ?? (preferences.isEnabled || Boolean(knowledgeSelection)));
    const source =
      isRaw ||
      input.harness !== undefined ||
      (knowledgeSelection && !preferences.isEnabled)
        ? 'request'
        : preferences.source;
    const receipt: GenerationHarnessReceipt = {
      originalPrompt: input.prompt,
      enhancedPrompt: input.prompt,
      brandId: input.brandId,
      brandMode: 'raw',
      ...(input.promptAuthor ? { promptAuthor: input.promptAuthor } : {}),
      status: 'skipped',
      source,
      appliedPacks: [],
    };
    if (!isEnabled) {
      if (requestedSkillSlugs?.length || knowledgeSelection)
        throw new BadRequestException(
          isRaw
            ? 'Remove selected skills and Knowledge to generate without brand.'
            : 'Enable enhancement or remove selected skills and Knowledge before generating.',
        );
      return receipt;
    }
    let stage: MediaPromptBrandEnhancementStage = 'brand_identity';
    try {
      const { mode, snapshot } = await this.resolveBrandIdentity(input);
      stage = 'brief';
      const brief = await this.harness.resolveBrief({
        userId: input.actorUserId,
        isApiKey: input.isApiKey,
        apiKeyId: input.apiKeyId,
        scopes: input.scopes,
        organizationId: input.organizationId,
        brandId: input.brandId,
        brandRevisionId: snapshot.revisionId,
        contentType: input.contentType,
        topic: input.prompt,
        includeContentMemory: true,
        surface: 'media',
        ...(knowledgeSelection ? { knowledgeSelection } : {}),
      });
      if (!brief) throw new Error('Harness brief is unavailable');
      stage = 'provider';
      const subjectLock = lockMediaUserPrompt(
        input.prompt,
        brandOfferingCorpus(snapshot, brief, input.prompt),
      );
      const { result, negativePrompt } = await this.promptEnhancement.enhance({
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        brandId: input.brandId,
        userPrompt: subjectLock,
        promptId: input.promptId,
        ...(requestedSkillSlugs ? { requestedSkillSlugs } : {}),
        model: input.model,
        contentType: input.contentType,
      });
      stage = 'response';
      const enhancedPrompt = buildMediaPromptFromHarness(result, brief, {
        subjectLock: subjectLock.split('\n\n')[0] ?? subjectLock,
      });
      const knowledgeReceipts = collectKnowledgeReceipts(
        selectMediaKnowledgeSources(brief),
      );
      stage = 'receipt';
      const loaded = await this.contentHarness.listLoadedPackVersions();
      return {
        ...receipt,
        enhancedPrompt,
        ...(negativePrompt ? { negativePrompt } : {}),
        brandMode: mode,
        brandRevisionId: snapshot.revisionId,
        brandRevisionVersion: snapshot.revisionVersion,
        ...(knowledgeReceipts.length > 0 ? { knowledgeReceipts } : {}),
        status: 'applied',
        appliedPacks: loaded.filter((pack) =>
          brief.appliedPacks.includes(pack.id),
        ),
      };
    } catch (error: unknown) {
      // Selection and authorization errors are actionable as thrown.
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      )
        throw error;
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
        'Media prompt brand enhancement failed; generation stopped';
      // A provider failure means the configured text model is unreachable:
      // an operator configuration problem, not a per-request hiccup.
      if (stage === 'provider') this.logger.error(message, undefined, failure);
      else this.logger.warn(message, failure);
      throw new MediaPromptBrandEnhancementException(stage);
    }
  }

  /**
   * The brand the generation is pinned to: an approved revision when one
   * exists, otherwise the brand's live draft, provisionally. The snapshot is
   * captured through the same seam the text route uses.
   */
  private async resolveBrandIdentity(
    input: MediaPromptEnhancementInput,
  ): Promise<{
    mode: Exclude<GenerationBrandMode, 'raw'>;
    snapshot: BrandIdentitySnapshotV1;
  }> {
    const resolution = await this.modes.resolve(
      {
        userId: input.actorUserId,
        organizationId: input.organizationId,
        isApiKey: input.isApiKey,
        apiKeyId: input.apiKeyId,
        scopes: input.scopes,
      },
      input.brandId,
    );
    const actor: BrandedGenerationActorV1 = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      actorId: input.actorUserId,
      ...(input.isApiKey ? { isApiKey: true } : {}),
      ...(input.apiKeyId ? { apiKeyId: input.apiKeyId } : {}),
      ...(input.scopes ? { scopes: input.scopes } : {}),
    };
    const snapshot =
      resolution.mode === 'approved_brand'
        ? await this.snapshots.preview(actor)
        : await this.snapshots.previewProvisional(
            actor,
            resolution.draftRevisionId,
          );
    return { mode: resolution.mode, snapshot };
  }
}
