import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { isValidPostLength } from '@api/collections/posts/services/post-generation-text.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { BrandedGenerationBlockedException } from '@api/helpers/exceptions/branded-generation-blocked/branded-generation-blocked.exception';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import { brandedReasonHttpStatus } from '@api/services/branded-text-generation/branded-text-generation-outcome.util';
import type { TextDispatchKeyResolver } from '@api/services/byok/text-dispatch-byok.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  CredentialPlatform,
  ModelCategory,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  AccountPublishingContext,
  PostDraftGenerationInput,
  PostDraftGenerationResult,
} from '@genfeedai/contracts/interfaces';
import type { LearningGenerationReceipt } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

type GenerationMetadata = Pick<
  AuthenticatedUser,
  'brandId' | 'organizationId' | 'userId'
>;
@Injectable()
export class PostDraftGenerationService {
  constructor(
    private readonly accountPublishingContextService: AccountPublishingContextService,
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly learningDecisionService: LearningDecisionService,
    private readonly postsService: PostsService,
    private readonly brandedTextGenerationService: BrandedTextGenerationService,
  ) {}
  async generateDraftText(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    resolveApiKey?: TextDispatchKeyResolver,
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
    if (dto.brandMode || dto.requestKey)
      return this.generateBrandedDraft(
        dto,
        identity,
        context,
        limit,
        resolveApiKey,
      );
    const systemPrompt = await this.buildDraftSystemPrompt(
      dto,
      identity,
      context,
    );
    // Admin → Automation → Models `isDefault` TEXT row wins; DEFAULT_MINI_TEXT_MODEL
    // (#5161) is only the seed used when no Admin default resolves.
    const model = await this.agentChatModelRegistry.resolveModelKey(
      undefined,
      DEFAULT_MINI_TEXT_MODEL,
    );
    const { input } = await this.promptBuilderService.buildPrompt(
      model,
      {
        brandingMode: 'off',
        modelCategory: ModelCategory.TEXT,
        maxTokens: Math.max(
          TEXT_GENERATION_LIMITS.postTweetGeneration,
          Math.ceil(limit / 2),
        ),
        prompt: [
          `Write one ${dto.platform} post, at most ${limit} characters.`,
          `Request: ${dto.prompt.trim()}`,
        ].join('\n'),
        systemPrompt,
        temperature: 0.8,
        useTemplate: false,
      },
      identity.organizationId,
    );
    const learningReceipt = await this.resolveAccountlessLearningReceipt(
      dto,
      identity,
      context.brand.id,
    );
    const apiKey = await resolveApiKey?.(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      const output = await this.replicateService.generateTextCompletionSync(
        model,
        input,
        apiKey,
      );
      const description = output?.trim();
      if (!description) {
        throw new BadRequestException('No draft was generated. Try again.');
      }
      if (
        isValidPostLength(
          description,
          limit,
          context.constraints.usesWeightedCharacters,
        )
      ) {
        return { description, model, learningReceipt };
      }
    }
    throw new BadRequestException(
      'The generated draft exceeds the channel limit. Try a shorter topic.',
    );
  }
  /**
   * Approved-brand draft (#5786): one receipt-backed provider call, the exact
   * text saved as a DRAFT post and bound to the receipt. A repeat of the same
   * `requestKey` returns the original and never dispatches again.
   */
  private async generateBrandedDraft(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    context: Pick<AccountPublishingContext, 'brand' | 'constraints'>,
    limit: number,
    resolveApiKey?: TextDispatchKeyResolver,
  ): Promise<PostDraftGenerationResult> {
    if (!dto.requestKey)
      throw new BadRequestException('branded_request_key_required');
    if (dto.brandMode !== 'approved_brand')
      throw new BadRequestException('brand_mode_required');
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
      input: {
        schemaVersion: 1,
        actorId: identity.userId,
        organizationId: identity.organizationId,
        brandId: dto.brandId,
        requestKey: dto.requestKey,
        candidateIndex: 0,
        surface: 'api',
        contentType: 'post',
        format: 'text',
        mode: 'approved_brand',
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
  private async buildDraftSystemPrompt(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    fallbackBrand: Pick<AccountPublishingContext, 'brand'>,
  ): Promise<string> {
    const platformInstruction = [
      `You are writing as this brand on ${dto.platform}.`,
      'Match the brand identity, voice, audience, guidelines, and recent-post style.',
      'Return only the finished post text, without explanations or quotation marks.',
    ].join(' ');

    const brandContext = await this.contextAssemblyService.assembleContext({
      brandId: dto.brandId,
      layers: {
        brandGuidance: true,
        brandIdentity: true,
        brandKnowledge: true,
        brandMemory: true,
        performancePatterns: true,
        ragContext: true,
        recentPosts: true,
      },
      organizationId: identity.organizationId,
      platform: dto.platform,
      query: dto.prompt.trim(),
      userId: identity.userId,
    });

    if (brandContext) {
      return this.contextAssemblyService.buildSystemPrompt(
        platformInstruction,
        brandContext,
      );
    }

    return [
      platformInstruction,
      `## Brand: ${fallbackBrand.brand.label ?? 'Brand'}`,
      fallbackBrand.brand.description,
      fallbackBrand.brand.voice
        ? `## Brand Voice\n${fallbackBrand.brand.voice}`
        : undefined,
    ]
      .filter((section): section is string => Boolean(section))
      .join('\n');
  }
  private async resolveAccountlessLearningReceipt(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    brandId: string,
  ): Promise<LearningGenerationReceipt> {
    const resolution = await this.learningDecisionService.resolveForGeneration({
      organizationId: identity.organizationId,
      brandId,
      format: 'text',
      originalPrompt: dto.prompt,
      harnessEnabled: false,
      compatible: false,
    });
    if (
      resolution.receipt.mode !== 'no_destination' ||
      resolution.receipt.reason !== 'no_destination' ||
      resolution.receipt.synthetic !== false ||
      Object.keys(resolution.contribution).length !== 0 ||
      Object.keys(resolution.receipt).some(
        (key) =>
          !['mode', 'reason', 'configVersion', 'synthetic'].includes(key),
      )
    )
      throw new InternalServerErrorException(
        'Accountless learning receipt integrity failed',
      );
    const parsed = learningGenerationReceiptSchema.safeParse({
      ...resolution.receipt,
      application: {
        status: 'unavailable',
        reasonCodes: ['no_destination'],
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
        revalidatedAt: new Date().toISOString(),
      },
    });
    if (!parsed.success)
      throw new InternalServerErrorException(
        'Accountless learning receipt integrity failed',
      );
    return parsed.data;
  }
}
