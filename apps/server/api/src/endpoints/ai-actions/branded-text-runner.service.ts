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
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { resolveAccountlessLearningReceipt } from '@api/services/branded-text-generation/accountless-learning-receipt.util';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import {
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { TextReceiptState } from '@genfeedai/contracts/interfaces';
import {
  joinReplyVariants,
  splitReplyVariants,
} from '@genfeedai/helpers/content/text-action/reply-variants.helper';
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
    private readonly material: BrandedGenerationArtifactMaterialService,
  ) {}

  async run(spec: BrandedTextRunSpecV1): Promise<BrandedTextRunOutcomeV1> {
    const model = await this.modelRegistry.resolveModelKey(
      undefined,
      DEFAULT_MINI_TEXT_MODEL,
    );
    const { actor, gate } = spec;
    const isThread = spec.contentType === 'thread';
    const brandMode = await this.modeResolver.resolve(actor, spec.brandId);
    const request: BrandedTextGenerationRequestV1 = {
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
        format: isThread ? 'thread' : 'text',
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
      persistText: async (raw) =>
        isThread
          ? this.persistThread(spec, gate.normalize(raw) ?? raw)
          : this.persistPost(spec, gate.normalize(raw) ?? raw),
    };
    const outcome = await (isThread
      ? this.branded.generateThread(request)
      : this.branded.generate(request)
    ).catch((error: unknown) => {
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
        ? isThread
          ? await this.readSavedThread(spec, outcome.postId, outcome.receipt)
          : await this.readSavedText(spec, outcome.postId, outcome.receipt)
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

  private async persistPost(
    spec: BrandedTextRunSpecV1,
    text: string,
  ): Promise<{ postId: string }> {
    const post = await this.posts.create(this.draftInput(spec, text));
    return { postId: String(post.id) };
  }

  /**
   * Saves each segment as its own post: the first is the thread root, the
   * rest are its ordered replies, so the receipt binds the whole thread and
   * the publisher posts it as a reply chain.
   */
  private async persistThread(
    spec: BrandedTextRunSpecV1,
    text: string,
  ): Promise<{ postId: string }> {
    const [first, ...replies] = splitReplyVariants(text);
    const root = await this.posts.create({
      ...this.draftInput(spec, first ?? text),
      format: PostFormat.THREAD,
      order: 0,
    });
    const rootId = String(root.id);
    try {
      for (const [index, description] of replies.entries())
        await this.posts.create({
          ...this.draftInput(spec, description),
          format: PostFormat.THREAD,
          order: index + 1,
          parentId: rootId,
          sourceActionId: `${spec.requestKey}:post:${index + 1}`,
        });
    } catch (error: unknown) {
      // A partly written thread is a draft nothing refers to: the receipt
      // fails without a draft id when a segment write fails.
      await this.posts.remove(rootId).catch(() => undefined);
      throw error;
    }
    return { postId: rootId };
  }

  private draftInput(
    spec: BrandedTextRunSpecV1,
    description: string,
  ): Parameters<PostsService['create']>[0] {
    return {
      brandId: spec.brandId,
      category: PostCategory.TEXT,
      description,
      format: PostFormat.STANDARD,
      ingredients: [],
      label: spec.label,
      organizationId: spec.actor.organizationId,
      platform: spec.platform,
      sourceActionId: spec.requestKey,
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: spec.actor.userId,
    };
  }

  /** A thread replay answers only while root and replies still hold the receipt's exact material. */
  private async readSavedThread(
    spec: BrandedTextRunSpecV1,
    postId: string,
    receipt: { artifact: { version: string } | null },
  ): Promise<string | null> {
    const binding = await this.material
      .describePostArtifact(
        {
          actorId: spec.actor.userId,
          brandId: spec.brandId,
          organizationId: spec.actor.organizationId,
        },
        postId,
      )
      .catch(() => null);
    if (!binding || binding.artifact.version !== receipt.artifact?.version)
      return null;
    const root = await this.posts.findOne(
      {
        brandId: spec.brandId,
        id: postId,
        isDeleted: false,
        organizationId: spec.actor.organizationId,
      },
      'none',
    );
    if (!root) return null;
    const replies = await this.posts.getChildren(
      postId,
      spec.actor.organizationId,
    );
    return joinReplyVariants([
      root.description,
      ...replies.map((reply) => reply.description),
    ]);
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
