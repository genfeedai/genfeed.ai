import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { isValidPostLength } from '@api/collections/posts/services/post-generation-text.util';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { TextDispatchKeyResolver } from '@api/services/byok/text-dispatch-byok.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  CredentialPlatform,
  ModelCategory,
  PostFormat,
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
