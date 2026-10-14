import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { isValidPostLength } from '@api/collections/posts/services/post-generation-text.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { BrandedGenerationBlockedException } from '@api/helpers/exceptions/branded-generation-blocked/branded-generation-blocked.exception';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { resolveAccountlessLearningReceipt } from '@api/services/branded-text-generation/accountless-learning-receipt.util';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import { brandedReasonHttpStatus } from '@api/services/branded-text-generation/branded-text-generation-outcome.util';
import type { TextDispatchKeyResolver } from '@api/services/byok/text-dispatch-byok.util';
import {
  CredentialPlatform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts';
import type {
  AccountPublishingContext,
  PostDraftGenerationInput,
  PostDraftGenerationResult,
} from '@genfeedai/contracts/interfaces';
import type { LearningGenerationReceipt } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface PostDraftGenerationOptions {
  /** Server-derived origin of the request; the HTTP route is always `api`. */
  surface?: 'api' | 'onboarding';
  /** Request key of the draft this one regenerates. */
  parentRequestId?: string;
}

type GenerationMetadata = Pick<
  AuthenticatedUser,
  'brandId' | 'organizationId' | 'userId' | 'isApiKey' | 'scopes'
>;
@Injectable()
export class PostDraftGenerationService {
  constructor(
    private readonly accountPublishingContextService: AccountPublishingContextService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly learningDecisionService: LearningDecisionService,
    private readonly postsService: PostsService,
    private readonly brandedTextGenerationService: BrandedTextGenerationService,
    private readonly brandedModeResolver: BrandedModeResolverService,
  ) {}
  async generateDraftText(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    resolveApiKey?: TextDispatchKeyResolver,
    options: PostDraftGenerationOptions = {},
  ): Promise<PostDraftGenerationResult> {
    if (!getChannelCapability(dto.platform)) {
      throw new BadRequestException('Select a supported publishing channel');
    }
    if (!dto.prompt.trim()) {
      throw new BadRequestException('Describe what the post should be about');
    }
    const context = await this.accountPublishingContextService.resolveDraft({
      brandId: dto.brandId,
      organizationId: identity.organizationId,
      platform: dto.platform,
    });
    if (dto.format === PostFormat.LONG_FORM) {
      if (dto.platform !== CredentialPlatform.TWITTER) {
        throw new BadRequestException('Long posts are only supported for X');
      }
      context.constraints = {
        ...context.constraints,
        maxCharacters: 25000,
        maxWeightedCharacters: undefined,
        usesWeightedCharacters: false,
      };
    }
    const limit =
      context.constraints.maxWeightedCharacters ??
      context.constraints.maxCharacters ??
      5000;
    return this.generateBrandedDraft(
      dto,
      identity,
      context,
      limit,
      resolveApiKey,
      options,
    );
  }

  /**
   * Receipt-backed draft (#5786): one provider call, the exact
   * text saved as a DRAFT post and bound to the receipt. A repeat of the same
   * `requestKey` returns the original and never dispatches again.
   */
  private async generateBrandedDraft(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    context: Pick<AccountPublishingContext, 'brand' | 'constraints'>,
    limit: number,
    resolveApiKey: TextDispatchKeyResolver | undefined,
    options: PostDraftGenerationOptions,
  ): Promise<PostDraftGenerationResult> {
    if (!dto.requestKey)
      throw new BadRequestException('branded_request_key_required');
    const brandMode = await this.brandedModeResolver.resolve(
      identity,
      dto.brandId,
    );
    const model = await this.agentChatModelRegistry.resolveModelKey(
      undefined,
      DEFAULT_MINI_TEXT_MODEL,
    );
    const learningReceipt = await this.resolveAccountlessLearningReceipt(
      dto,
      identity,
      context.brand.id,
    );
    const outcome = await this.brandedTextGenerationService.generate({
      initiatingActor: identity,
      input: {
        schemaVersion: 1,
        actorId: identity.userId,
        organizationId: identity.organizationId,
        brandId: dto.brandId,
        requestKey: dto.requestKey,
        candidateIndex: 0,
        surface: options.surface ?? 'api',
        contentType: 'post',
        format: 'text',
        ...brandMode,
        ...(options.parentRequestId
          ? { parentRequestId: options.parentRequestId }
          : {}),
        originalPrompt: [
          `Write one ${dto.platform} post, at most ${limit} characters.`,
          'Return only the finished post text, without explanations or quotation marks.',
          `Request: ${dto.prompt.trim()}`,
        ].join('\n'),
        provider: 'openrouter',
        model,
        generationParameters: {
          maxTokens: Math.max(
            TEXT_GENERATION_LIMITS.postTweetGeneration,
            Math.ceil(limit / 2),
          ),
          temperature: 0.8,
        },
        platform: dto.platform,
        objective: 'engagement',
        knowledgeSourceIds: [],
        knowledgeSpaceIds: [],
      },
      privateLearning: learningReceipt,
      resolveApiKey: resolveApiKey ?? (async () => undefined),
      acceptText: (text) =>
        isValidPostLength(
          text,
          limit,
          context.constraints.usesWeightedCharacters,
        ),
      persistText: async (text) => {
        const post = await this.postsService.create({
          brandId: dto.brandId,
          category: PostCategory.TEXT,
          description: text,
          format: dto.format ?? PostFormat.STANDARD,
          ingredients: [],
          label: '',
          organizationId: identity.organizationId,
          platform: dto.platform,
          targetExecutionState: TargetExecutionState.DRAFT,
          userId: identity.userId,
        });
        return { postId: String(post.id) };
      },
    });
    if (outcome.kind === 'in_progress')
      throw new BrandedGenerationBlockedException(
        409,
        'branded_generation_in_progress',
        outcome.receipt.id,
      );
    if (outcome.kind === 'stopped')
      throw new BrandedGenerationBlockedException(
        brandedReasonHttpStatus(outcome.reasonCode),
        outcome.reasonCode,
        outcome.receipt.id,
        outcome.hasNewDispatch ? { model } : null,
      );
    const description =
      outcome.text ??
      (await this.readSavedDraft(dto.brandId, identity, outcome));
    return {
      brandedReceipt: {
        compliance: outcome.receipt.compliance,
        id: outcome.receipt.id,
        isReplayed: !outcome.hasNewDispatch,
        revision: outcome.receipt.revision,
        state: outcome.receipt.state,
      },
      description,
      learningReceipt,
      model,
      postId: outcome.postId,
    };
  }

  /** A replay returns the bound post only while it still holds the generated text. */
  private async readSavedDraft(
    brandId: string,
    identity: GenerationMetadata,
    outcome: {
      postId: string;
      receipt: { artifact: { version: string } | null; id: string };
    },
  ): Promise<string> {
    const post = await this.postsService.findOne(
      {
        brandId,
        id: outcome.postId,
        isDeleted: false,
        organizationId: identity.organizationId,
      },
      'none',
    );
    if (!post)
      throw new BrandedGenerationBlockedException(
        409,
        'receipt_artifact_not_found',
        outcome.receipt.id,
      );
    if (
      hashBrandedGenerationTextV1(post.description) !==
      outcome.receipt.artifact?.version
    )
      throw new BrandedGenerationBlockedException(
        409,
        'receipt_artifact_version_mismatch',
        outcome.receipt.id,
      );
    return post.description;
  }
  private resolveAccountlessLearningReceipt(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    brandId: string,
  ): Promise<LearningGenerationReceipt> {
    return resolveAccountlessLearningReceipt(this.learningDecisionService, {
      brandId,
      organizationId: identity.organizationId,
      originalPrompt: dto.prompt,
    });
  }
}
