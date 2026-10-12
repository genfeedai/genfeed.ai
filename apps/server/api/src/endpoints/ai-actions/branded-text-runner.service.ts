import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import type {
  BrandedTextRunOutcomeV1,
  BrandedTextRunSpecV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { resolveAccountlessLearningReceipt } from '@api/services/branded-text-generation/accountless-learning-receipt.util';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import {
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const NO_APPROVED_VOICE_REASON = 'no_approved_revision';

const FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  artifact_bind_failed: 'The result could not be saved. Try again.',
  artifact_persist_failed: 'The result could not be saved. Try again.',
  provider_attempt_ref_unavailable:
    'The text provider did not accept the request. Try again.',
  provider_output_empty: 'The text provider returned nothing. Try again.',
};

/**
 * Runs one branded text generation for a text action (#4343, #4342). A brand
 * with an approved voice goes through the branded seam: one receipt-backed
 * provider call, the gate-normalized answer saved as a draft artifact, a
 * repeat of the same `requestKey` answered from the receipt without a new
 * call. A brand with no approved voice is written for without voice context
 * and says so; no other seam outcome falls back to an unbranded call.
 */
@Injectable()
export class BrandedTextRunnerService {
  constructor(
    private readonly branded: BrandedTextGenerationService,
    private readonly posts: PostsService,
    private readonly learningDecisions: LearningDecisionService,
    private readonly modelRegistry: AgentChatModelRegistryService,
    private readonly openRouter: OpenRouterService,
    private readonly logger: LoggerService,
  ) {}

  async run(spec: BrandedTextRunSpecV1): Promise<BrandedTextRunOutcomeV1> {
    const model = await this.modelRegistry.resolveModelKey(
      undefined,
      DEFAULT_MINI_TEXT_MODEL,
    );
    const { actor, gate } = spec;
    const outcome = await this.branded.generate({
      initiatingActor: actor,
      input: {
        schemaVersion: 1,
        actorId: actor.userId,
        organizationId: actor.organizationId,
        brandId: spec.brandId,
        requestKey: spec.requestKey,
        candidateIndex: 0,
        surface: 'agent',
        contentType: spec.contentType,
        format: 'text',
        mode: 'approved_brand',
        originalPrompt: spec.promptFor(true),
        provider: 'openrouter',
        model,
        generationParameters: spec.generation,
        platform: spec.platform,
        objective: 'engagement',
        knowledgeSourceIds: [],
        knowledgeSpaceIds: [],
      },
      privateLearning: await resolveAccountlessLearningReceipt(
        this.learningDecisions,
        {
          brandId: spec.brandId,
          organizationId: actor.organizationId,
          originalPrompt: spec.sourceText,
        },
      ),
      resolveApiKey: async () => undefined,
      acceptText: (raw) => gate.normalize(raw) !== null,
      persistText: async (raw) => {
        const post = await this.posts.create({
          brandId: spec.brandId,
          category: PostCategory.TEXT,
          description: gate.normalize(raw) ?? raw,
          format: PostFormat.STANDARD,
          ingredients: [],
          label: spec.label,
          organizationId: actor.organizationId,
          platform: spec.platform,
          sourceActionId: spec.requestKey,
          targetExecutionState: TargetExecutionState.DRAFT,
          userId: actor.userId,
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
      const receiptId = outcome.receipt.id;
      if (outcome.reasonCode === NO_APPROVED_VOICE_REASON) {
        return this.writeWithoutVoice(spec, model);
      }
      if (outcome.reasonCode === 'channel_limit_exceeded') {
        return { kind: 'rejected', receiptId };
      }
      const message = FAILURE_MESSAGES[outcome.reasonCode];
      return message
        ? {
            kind: 'failed',
            code: 'provider_unavailable',
            message,
            reasonCode: outcome.reasonCode,
            receiptId,
          }
        : {
            kind: 'failed',
            code: 'blocked',
            message: `Your brand voice could not be applied (${outcome.reasonCode}). Nothing was written.`,
            reasonCode: outcome.reasonCode,
            receiptId,
          };
    }
    const text =
      outcome.text === null
        ? await this.readSavedText(spec, outcome.postId, outcome.receipt)
        : gate.normalize(outcome.text);
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
      hasBrandVoice: true,
      hasNewDispatch: outcome.hasNewDispatch,
      isReplayed: !outcome.hasNewDispatch,
      receiptId: outcome.receipt.id,
      text,
    };
  }

  /** The brand has no approved voice: one plain provider call, no receipt. */
  private async writeWithoutVoice(
    spec: BrandedTextRunSpecV1,
    model: string,
  ): Promise<BrandedTextRunOutcomeV1> {
    let raw: string;
    try {
      const response = await this.openRouter.chatCompletion({
        max_tokens: spec.generation.maxTokens,
        messages: [{ role: 'user', content: spec.promptFor(false) }],
        model,
        temperature: spec.generation.temperature,
      });
      raw = (response.choices?.[0]?.message?.content ?? '').trim();
    } catch (error: unknown) {
      this.logger.error(`${BrandedTextRunnerService.name} plain call failed`, {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        kind: 'failed',
        code: 'provider_unavailable',
        message: 'The text provider is unavailable. Try again.',
      };
    }
    if (!raw) {
      return {
        kind: 'failed',
        code: 'provider_unavailable',
        message: FAILURE_MESSAGES.provider_output_empty,
      };
    }
    const text = spec.gate.normalize(raw);
    if (text === null) return { kind: 'rejected' };
    return {
      kind: 'completed',
      hasBrandVoice: false,
      hasNewDispatch: true,
      isReplayed: false,
      text,
    };
  }

  /** A replay answers from the saved draft while it still holds the receipt's exact text. */
  private async readSavedText(
    spec: BrandedTextRunSpecV1,
    postId: string,
    receipt: { artifact: { version: string } | null },
  ): Promise<string | null> {
    const post = await this.posts.findOne(
      {
        brandId: spec.brandId,
        id: postId,
        isDeleted: false,
        organizationId: spec.actor.organizationId,
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
