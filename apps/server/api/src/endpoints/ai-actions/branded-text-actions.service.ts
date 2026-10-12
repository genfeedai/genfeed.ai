import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import type {
  TextActionFailureCode,
  TextActionOutcomeV1,
  TextActionRequestV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import { buildTextActionPrompt } from '@api/endpoints/ai-actions/text-action-prompt.util';
import {
  createTextActionAcceptance,
  resolveTextActionLimit,
  type TextActionAcceptance,
} from '@api/endpoints/ai-actions/text-action-text.util';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { resolveAccountlessLearningReceipt } from '@api/services/branded-text-generation/accountless-learning-receipt.util';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type { BrandedTextGenerationOutcomeV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import {
  CredentialPlatform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts';
import type { TextActionResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const DEFAULT_CHANNEL_LIMIT = 5000;
const NO_APPROVED_VOICE_REASON = 'no_approved_revision';
const MAX_OUTPUT_TOKENS = 32000;

/** Shown when an edit ran without voice context, so the user can fix the cause. */
export const NO_BRAND_VOICE_HINT =
  'This brand has no approved voice yet, so the text was edited without voice context. Set up and approve your brand voice in Genfeed to rewrite in your voice.';

const FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  artifact_bind_failed: 'The result could not be saved. Try again.',
  artifact_persist_failed: 'The result could not be saved. Try again.',
  provider_attempt_ref_unavailable:
    'The text provider did not accept the request. Try again.',
  provider_output_empty: 'The text provider returned nothing. Try again.',
};

/**
 * Proofreads or rewrites a draft the user wrote (#4343). A brand with an
 * approved voice goes through the branded seam: one receipt-backed provider
 * call, the exact result saved as a draft artifact, a repeat of the same
 * `requestKey` answered from the receipt without a new call. A brand with no
 * approved voice is edited without voice context and says so; no other seam
 * outcome falls back to an unbranded call.
 */
@Injectable()
export class BrandedTextActionsService {
  constructor(
    private readonly branded: BrandedTextGenerationService,
    private readonly posts: PostsService,
    private readonly learningDecisions: LearningDecisionService,
    private readonly modelRegistry: AgentChatModelRegistryService,
    private readonly openRouter: OpenRouterService,
    private readonly logger: LoggerService,
  ) {}

  async run(request: TextActionRequestV1): Promise<TextActionOutcomeV1> {
    const capability = getChannelCapability(request.platform);
    if (!capability) {
      return {
        kind: 'failed',
        code: 'unsupported_platform',
        message: 'This platform is not supported for text actions.',
      };
    }
    const usesWeightedCharacters =
      capability.platform === CredentialPlatform.TWITTER;
    const maxCharacters = resolveTextActionLimit({
      channelLimit: capability.caption.maxLength ?? DEFAULT_CHANNEL_LIMIT,
      mode: request.mode,
      source: request.text,
      usesWeightedCharacters,
    });
    const acceptance = createTextActionAcceptance({
      maxCharacters,
      mode: request.mode,
      source: request.text,
      usesWeightedCharacters,
    });
    const model = await this.modelRegistry.resolveModelKey(
      undefined,
      DEFAULT_MINI_TEXT_MODEL,
    );
    const generation = {
      maxTokens: Math.min(
        MAX_OUTPUT_TOKENS,
        Math.max(
          TEXT_GENERATION_LIMITS.postTweetGeneration,
          Math.ceil(maxCharacters / 2),
        ),
      ),
      temperature: request.mode === 'proofread' ? 0.2 : 0.7,
    };
    const promptFor = (hasBrandVoice: boolean) =>
      buildTextActionPrompt({
        hasBrandVoice,
        maxCharacters,
        mode: request.mode,
        platformLabel: capability.label,
        text: request.text,
      });
    const base = {
      maxCharacters,
      mode: request.mode,
      platform: request.platform,
    };

    const outcome = await this.branded.generate({
      initiatingActor: request.actor,
      input: {
        schemaVersion: 1,
        actorId: request.actor.userId,
        organizationId: request.actor.organizationId,
        brandId: request.brandId,
        requestKey: request.requestKey,
        candidateIndex: 0,
        surface: 'agent',
        contentType: 'post',
        format: 'text',
        mode: 'approved_brand',
        originalPrompt: promptFor(true),
        provider: 'openrouter',
        model,
        generationParameters: generation,
        platform: request.platform,
        objective: 'engagement',
        knowledgeSourceIds: [],
        knowledgeSpaceIds: [],
      },
      privateLearning: await resolveAccountlessLearningReceipt(
        this.learningDecisions,
        {
          brandId: request.brandId,
          organizationId: request.actor.organizationId,
          originalPrompt: request.text,
        },
      ),
      resolveApiKey: async () => undefined,
      acceptText: acceptance.accept,
      persistText: async (text) => {
        const post = await this.posts.create({
          brandId: request.brandId,
          category: PostCategory.TEXT,
          description: text,
          format: PostFormat.STANDARD,
          ingredients: [],
          label:
            request.mode === 'proofread'
              ? 'Extension proofread'
              : 'Extension rewrite',
          organizationId: request.actor.organizationId,
          platform: capability.platform,
          sourceActionId: request.requestKey,
          targetExecutionState: TargetExecutionState.DRAFT,
          userId: request.actor.userId,
        });
        return { postId: String(post.id) };
      },
    });

    if (outcome.kind === 'in_progress') {
      return {
        kind: 'failed',
        code: 'in_progress',
        message:
          'This request is already running. Wait a moment, then try again.',
        receiptId: outcome.receipt.id,
      };
    }
    if (outcome.kind === 'stopped') {
      if (outcome.reasonCode === NO_APPROVED_VOICE_REASON) {
        return this.editWithoutVoice({
          acceptance,
          base,
          model,
          generation,
          prompt: promptFor(false),
        });
      }
      return this.stopped(outcome, acceptance, maxCharacters);
    }
    const text =
      outcome.text ??
      (await this.readSavedText(request, outcome.postId, outcome.receipt));
    if (text === null) {
      return {
        kind: 'failed',
        code: 'blocked',
        message:
          'The saved result is no longer available. Run the action again.',
        reasonCode: 'receipt_artifact_not_found',
        receiptId: outcome.receipt.id,
      };
    }
    return {
      kind: 'completed',
      hasNewDispatch: outcome.hasNewDispatch,
      result: {
        ...base,
        hasBrandVoice: true,
        isReplayed: !outcome.hasNewDispatch,
        receiptId: outcome.receipt.id,
        text,
      },
    };
  }

  /** The brand has no approved voice: one plain provider call, no receipt. */
  private async editWithoutVoice(input: {
    acceptance: TextActionAcceptance;
    base: Pick<TextActionResult, 'maxCharacters' | 'mode' | 'platform'>;
    generation: { maxTokens: number; temperature: number };
    model: string;
    prompt: string;
  }): Promise<TextActionOutcomeV1> {
    let text: string;
    try {
      const response = await this.openRouter.chatCompletion({
        max_tokens: input.generation.maxTokens,
        messages: [{ role: 'user', content: input.prompt }],
        model: input.model,
        temperature: input.generation.temperature,
      });
      text = (response.choices?.[0]?.message?.content ?? '').trim();
    } catch (error: unknown) {
      this.logger.error(`${BrandedTextActionsService.name} plain edit failed`, {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        kind: 'failed',
        code: 'provider_unavailable',
        message: 'The text provider is unavailable. Try again.',
      };
    }
    if (!text) {
      return {
        kind: 'failed',
        code: 'provider_unavailable',
        message: FAILURE_MESSAGES.provider_output_empty,
      };
    }
    if (!input.acceptance.accept(text)) {
      return this.rejection(input.acceptance, input.base.maxCharacters);
    }
    return {
      kind: 'completed',
      hasNewDispatch: true,
      result: {
        ...input.base,
        hasBrandVoice: false,
        isReplayed: false,
        text,
        voiceHint: NO_BRAND_VOICE_HINT,
      },
    };
  }

  private stopped(
    outcome: Extract<BrandedTextGenerationOutcomeV1, { kind: 'stopped' }>,
    acceptance: TextActionAcceptance,
    maxCharacters: number,
  ): TextActionOutcomeV1 {
    const receiptId = outcome.receipt.id;
    if (outcome.reasonCode === 'channel_limit_exceeded') {
      return { ...this.rejection(acceptance, maxCharacters), receiptId };
    }
    const message = FAILURE_MESSAGES[outcome.reasonCode];
    if (message) {
      return {
        kind: 'failed',
        code: 'provider_unavailable',
        message,
        reasonCode: outcome.reasonCode,
        receiptId,
      };
    }
    return {
      kind: 'failed',
      code: 'blocked',
      message: `Your brand voice could not be applied (${outcome.reasonCode}). Nothing was written.`,
      reasonCode: outcome.reasonCode,
      receiptId,
    };
  }

  private rejection(
    acceptance: TextActionAcceptance,
    maxCharacters: number,
  ): Extract<TextActionOutcomeV1, { kind: 'failed' }> {
    const code: TextActionFailureCode =
      acceptance.rejection() === 'tokens'
        ? 'text_changed_meaning'
        : 'limit_exceeded';
    return {
      kind: 'failed',
      code,
      message:
        code === 'text_changed_meaning'
          ? 'The edit dropped or changed a mention, hashtag or link. Try again.'
          : `The result did not fit the ${maxCharacters}-character limit. Try again.`,
    };
  }

  /** A replay answers from the saved draft while it still holds the receipt's exact text. */
  private async readSavedText(
    request: TextActionRequestV1,
    postId: string,
    receipt: { artifact: { version: string } | null },
  ): Promise<string | null> {
    const post = await this.posts.findOne(
      {
        brandId: request.brandId,
        id: postId,
        isDeleted: false,
        organizationId: request.actor.organizationId,
      },
      'none',
    );
    if (
      !post ||
      hashBrandedGenerationTextV1(post.description) !==
        receipt.artifact?.version
    )
      return null;
    return post.description;
  }
}
