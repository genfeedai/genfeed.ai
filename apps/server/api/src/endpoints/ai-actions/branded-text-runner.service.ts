import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import type {
  BrandedTextRunOutcomeV1,
  BrandedTextRunSpecV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import {
  MISSING_PROVIDER_KEY_CODE,
  MissingProviderKeyException,
} from '@api/helpers/exceptions/missing-provider-key/missing-provider-key.exception';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { resolveAccountlessLearningReceipt } from '@api/services/branded-text-generation/accountless-learning-receipt.util';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import {
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { TextReceiptState } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  artifact_bind_failed: 'The result could not be saved. Try again.',
  artifact_persist_failed: 'The result could not be saved. Try again.',
  provider_attempt_ref_unavailable:
    'The text provider did not accept the request. Try again.',
  provider_output_empty: 'The text provider returned nothing. Try again.',
};

/** A completed seam outcome is `ready`, `needs_review` or still `checking`; anything else reads as review. */
function completedReceiptState(state: string): TextReceiptState {
  return state === 'ready' || state === 'checking' ? state : 'needs_review';
}

/**
 * Runs one branded text generation for an agent text action (#4343, #4342,
 * #5786). Every run goes through the branded seam: the server resolves the
 * mode (the approved kit, else the brand's provisional draft), makes one
 * receipt-backed provider call, saves the gate-normalized answer as the
 * receipt's draft artifact, and answers a repeat of the same `requestKey` from
 * the receipt without a new call. A stopped seam never falls back to an
 * unreceipted call.
 */
@Injectable()
export class BrandedTextRunnerService {
  constructor(
    private readonly branded: BrandedTextGenerationService,
    private readonly modeResolver: BrandedModeResolverService,
    private readonly posts: PostsService,
    private readonly learningDecisions: LearningDecisionService,
    private readonly modelRegistry: AgentChatModelRegistryService,
  ) {}

  async run(spec: BrandedTextRunSpecV1): Promise<BrandedTextRunOutcomeV1> {
    const model = await this.modelRegistry.resolveModelKey(
      undefined,
      DEFAULT_MINI_TEXT_MODEL,
    );
    const { actor, gate } = spec;
    const brandMode = await this.modeResolver.resolve(actor, spec.brandId);
    const outcome = await this.branded
      .generate({
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
          ...brandMode,
          originalPrompt: spec.prompt,
          provider: 'openrouter',
          model,
          generationParameters: spec.generation,
          platform: spec.platform,
          objective: 'engagement',
          knowledgeSourceIds: spec.knowledgeSourceIds ?? [],
          knowledgeSpaceIds: spec.knowledgeSpaceIds ?? [],
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
      })
      .catch((error: unknown) => {
        if (error instanceof MissingProviderKeyException) return error;
        throw error;
      });

    if (outcome instanceof MissingProviderKeyException) {
      return {
        kind: 'failed',
        code: 'provider_unavailable',
        message: `${outcome.message}. Add it to the server environment, then try again.`,
        reasonCode: MISSING_PROVIDER_KEY_CODE,
      };
    }

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
      if (outcome.reasonCode === 'channel_limit_exceeded') {
        return {
          kind: 'rejected',
          receiptId,
          hasNewDispatch: outcome.hasNewDispatch,
        };
      }
      const message = FAILURE_MESSAGES[outcome.reasonCode];
      return message
        ? {
            kind: 'failed',
            code: 'provider_unavailable',
            message,
            hasNewDispatch: outcome.hasNewDispatch,
            reasonCode: outcome.reasonCode,
            receiptId,
          }
        : {
            kind: 'failed',
            code: 'blocked',
            message: `Your brand voice could not be applied (${outcome.reasonCode}). Nothing was written.`,
            hasNewDispatch: outcome.hasNewDispatch,
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
        hasNewDispatch: outcome.hasNewDispatch,
        reasonCode: 'receipt_artifact_not_found',
        receiptId: outcome.receipt.id,
      };
    }
    return {
      kind: 'completed',
      hasNewDispatch: outcome.hasNewDispatch,
      isReplayed: !outcome.hasNewDispatch,
      postId: outcome.postId,
      receiptId: outcome.receipt.id,
      receiptState: completedReceiptState(outcome.receipt.state),
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
