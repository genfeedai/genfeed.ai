import { randomUUID } from 'node:crypto';
import { AgentScopeContextService } from '@api/agent-context/agent-scope-context.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  isTwitterPlatform,
  threadExpansionBlockReason,
} from '@api/collections/posts/controllers/operations/posts-generation.helpers';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import { BrandedContentActionsService } from '@api/endpoints/ai-actions/branded-content-actions.service';
import type { BrandedPostsOutcomeV1 } from '@api/endpoints/ai-actions/branded-text-actions.types';
import {
  type AddThreadPostsInput,
  FIRST_COMMENT_LABEL,
  GROK_FEEDBACK_LABEL,
  parseAddFirstCommentInput,
  parseAddThreadPostsInput,
  parseDraftThreadInput,
  planThreadReplies,
  supportsFirstComment,
  THREAD_REPLY_LABEL,
  type ThreadReplyPlan,
} from '@api/services/agent-orchestrator/tools/agent-thread-tool.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { resolveToolSchedulePrincipal } from '@api/services/agent-orchestrator/utils/agent-initiating-principal.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ActivitySource,
  Platform,
  PostCategory,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { resolvePostVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

/** Flat charge for one proposal, the price of every agent text tool. */
const DRAFT_THREAD_CREDITS = GENERATE_CONTENT_TEXT_CREDITS;

type SavedThreadPost = { description: string; id: string; order: number };

function stripMarkup(description: string | undefined): string {
  return description?.replace(/<[^>]+>/g, ' ').trim() ?? '';
}

function failure(
  error: string,
  data?: Record<string, unknown>,
): AgentToolResult {
  return { creditsUsed: 0, error, success: false, ...(data ? { data } : {}) };
}

const INSUFFICIENT_CREDITS_RESULT: AgentToolResult = {
  creditsUsed: 0,
  data: { code: 'insufficient_credits' },
  error: 'Not enough credits to draft a thread.',
  success: false,
};

/**
 * X thread and first-comment agent tools (#6809). `draft_thread` only
 * proposes replies, written through the branded seam with a receipt (#5786);
 * `add_thread_posts` and `add_first_comment` are approval-required and save
 * drafts under a post the caller's organization owns, mirroring the post
 * composer (`handleAddThreadPosts`).
 */
@Injectable()
export class AgentThreadToolHandler {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly postsService: PostsService,
    private readonly brandedContentActions: BrandedContentActionsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    @Optional()
    private readonly agentScopeContextService?: AgentScopeContextService,
  ) {}

  handles(toolName: string): boolean {
    return (
      toolName === 'draft_thread' ||
      toolName === 'add_thread_posts' ||
      toolName === 'add_first_comment'
    );
  }

  execute(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'draft_thread':
        return this.draftThread(params, ctx);
      case 'add_thread_posts':
        return this.addThreadPosts(params, ctx);
      case 'add_first_comment':
        return this.addFirstComment(params, ctx);
      default:
        throw new BadRequestException(`Unknown thread tool: ${toolName}`);
    }
  }

  /**
   * Proposes replies for an X post. Nothing is added to the post's thread; the
   * proposal is recorded on a brand receipt whose id returns to the chat.
   *
   * Billing mirrors the other agent text tools: admitted up front, then one flat
   * charge when this call reached the provider, whether the replies were usable
   * or the run stopped afterwards. A replay and a stop before the provider are
   * free. The charge is settled here, so the result is billing-delegated.
   */
  async draftThread(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const input = parseDraftThreadInput(params);
    if ('error' in input) return failure(input.error);

    const post = await this.findOwnedPost(input.postId, ctx);
    const blocked = await this.threadBlockReason(post, ctx, true);
    if (blocked || !post) {
      return failure(blocked ?? 'The specified post does not exist');
    }
    this.assertBrandScope(post, ctx);

    const brandId = post.brandId ?? ctx.validatedScope?.brandId;
    if (!brandId) return failure('A brand is required to draft a thread.');

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        ctx.organizationId,
        DRAFT_THREAD_CREDITS,
      );
    if (!hasCredits) return INSUFFICIENT_CREDITS_RESULT;

    let outcome: BrandedPostsOutcomeV1;
    try {
      outcome = await this.brandedContentActions.draftThreadReplies({
        actor: resolveToolSchedulePrincipal(ctx) ?? {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
        brandId,
        count: input.count,
        originalContent: stripMarkup(post.description),
        requestKey: randomUUID(),
        tone: input.tone ?? 'professional',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `Thread draft failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.constructorName,
      );
      return failure('Failed to draft the thread. Try again.');
    }
    const isCharged = outcome.hasNewDispatch === true;
    if (isCharged) await this.chargeDraft(ctx, brandId);
    const billing = isCharged
      ? { creditsUsed: DRAFT_THREAD_CREDITS, isBillingDelegated: true }
      : { creditsUsed: 0 };
    if (outcome.kind === 'failed') {
      return {
        ...billing,
        data: {
          code: outcome.code,
          ...(outcome.reasonCode ? { reasonCode: outcome.reasonCode } : {}),
          ...(outcome.receiptId ? { receiptId: outcome.receiptId } : {}),
        },
        error: outcome.message,
        success: false,
      };
    }
    const { posts: proposedPosts, receiptId, receiptState } = outcome.result;
    if (proposedPosts.length === 0) {
      return {
        ...billing,
        error: 'No valid replies were generated. Try again or change the tone.',
        success: false,
      };
    }

    return {
      ...billing,
      data: {
        isAddedToThread: false,
        nextStep:
          'Show the proposed posts to the user. Call add_thread_posts only with the posts they accept.',
        postId: input.postId,
        proposedPosts,
        receiptId,
        receiptState,
        requestedReplies: input.count - 1,
      },
      nextActions: [
        {
          brandedReceipt: { id: receiptId, state: receiptState },
          contentFormat: 'thread',
          description:
            'Proposed replies. Nothing is added to the thread until you accept.',
          id: `thread-draft-${input.postId}-${Date.now()}`,
          platform: Platform.TWITTER,
          textContent: proposedPosts[0],
          title: `Proposed thread replies (${proposedPosts.length})`,
          tweets: proposedPosts,
          type: 'content_preview_card',
        },
      ],
      success: true,
    };
  }

  private async chargeDraft(
    ctx: ToolExecutionContext,
    brandId: string,
  ): Promise<void> {
    await this.creditsUtilsService.deductCreditsFromOrganization(
      ctx.organizationId,
      ctx.userId,
      DRAFT_THREAD_CREDITS,
      'Agent tool: draft_thread',
      ActivitySource.SCRIPT,
      { brandId },
    );
  }

  /** Saves accepted replies in order; a closing @grok post stays last. */
  async addThreadPosts(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const input = parseAddThreadPostsInput(params);
    if ('error' in input) return failure(input.error);

    const post = await this.findOwnedPost(input.postId, ctx);
    const blocked = await this.threadBlockReason(post, ctx, false);
    if (blocked || !post) {
      return failure(blocked ?? 'The specified post does not exist');
    }
    this.assertBrandScope(post, ctx);
    if (!post.credentialId) {
      return failure(
        'Select a publishing account before adding a thread post.',
      );
    }

    const children = await this.postsService.getChildren(
      input.postId,
      ctx.organizationId,
      [],
      500,
    );
    const plan = planThreadReplies(children, input.posts, input.grokQuestion);
    const saved: SavedThreadPost[] = [];
    let problem: unknown = null;

    for (const reply of plan.toCreate) {
      try {
        const created = await this.postsService.create(
          this.buildChildDraft(post, ctx, {
            description: reply.description,
            label: THREAD_REPLY_LABEL,
            order: reply.order,
          }),
          [],
        );
        saved.push({ ...reply, id: String(created.id) });
      } catch (error: unknown) {
        problem = error;
        break;
      }
    }

    let closingPostId: string | undefined;
    try {
      closingPostId = await this.settleClosingGrok(
        post,
        ctx,
        plan,
        saved.length,
        problem === null,
      );
    } catch (error: unknown) {
      problem ??= error;
    }

    if (problem !== null) {
      this.loggerService.error(
        `add_thread_posts failed after ${saved.length} of ${plan.toCreate.length} replies: ${problem instanceof Error ? problem.message : 'Unknown error'}`,
        this.constructorName,
      );
      return this.partialFailure(input, plan, saved, closingPostId);
    }

    return {
      creditsUsed: 0,
      data: {
        alreadySavedCount: plan.alreadySaved.length,
        ...(closingPostId ? { closingPostId } : {}),
        parentId: input.postId,
        savedPosts: saved,
      },
      success: true,
    };
  }

  /** Saves a first comment on a platform the composer supports it for. */
  async addFirstComment(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const input = parseAddFirstCommentInput(params);
    if ('error' in input) return failure(input.error);

    const post = await this.findOwnedPost(input.postId, ctx);
    if (!post) return failure('The specified post does not exist');
    this.assertBrandScope(post, ctx);
    if (!supportsFirstComment(post.platform)) {
      return failure(
        'First comments are only available for YouTube, Instagram, LinkedIn, Facebook and Reddit posts.',
      );
    }
    if (!post.credentialId) {
      return failure('Select a publishing account before adding a comment.');
    }

    const children = await this.postsService.getChildren(
      input.postId,
      ctx.organizationId,
      [],
      500,
    );
    const existing = children.find(
      (child) => child.category === PostCategory.TEXT,
    );
    if (existing) {
      return {
        creditsUsed: 0,
        data: { alreadyExists: true, commentId: String(existing.id) },
        success: true,
      };
    }

    const created = await this.postsService.create(
      this.buildChildDraft(post, ctx, {
        category: PostCategory.TEXT,
        description: input.comment,
        label: FIRST_COMMENT_LABEL,
        order: children.length + 1,
      }),
      [],
    );
    return {
      creditsUsed: 0,
      data: { commentId: String(created.id), parentId: input.postId },
      success: true,
    };
  }

  private findOwnedPost(
    postId: string,
    ctx: ToolExecutionContext,
  ): Promise<PostDocument | null> {
    return this.postsService.findOne(
      scopedWhere(ctx.organizationId, { id: postId }),
      [],
    );
  }

  /**
   * The REST thread-draft refusals (`threadExpansionBlockReason`). A post in
   * another organization is invisible to the scoped lookup, so it refuses as
   * "does not exist" instead of confirming that it exists.
   */
  private async threadBlockReason(
    post: PostDocument | null,
    ctx: ToolExecutionContext,
    isNewThread: boolean,
  ): Promise<string | undefined> {
    const existingChildren =
      post && isNewThread
        ? await this.postsService.count(ctx.organizationId, {
            parentId: String(post.id),
          })
        : 0;
    return threadExpansionBlockReason({
      existingChildren,
      isOwned: Boolean(post),
      isTwitter: isTwitterPlatform(post?.platform),
      postExists: Boolean(post),
    })?.detail;
  }

  private assertBrandScope(post: PostDocument, ctx: ToolExecutionContext) {
    const scope = ctx.validatedScope;
    if (scope?.brandId && this.agentScopeContextService) {
      this.agentScopeContextService.assertResourceBrand(
        scope,
        post.brandId,
        'Post',
      );
    }
  }

  private buildChildDraft(
    parent: PostDocument,
    ctx: ToolExecutionContext,
    child: {
      category?: PostCategory;
      description: string;
      label: string;
      order: number;
    },
  ): PostCreateInput {
    return {
      ...(ctx.runId ? { workflowExecutionId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
      agentContextSource: ctx.validatedScope?.source,
      agentContextVersion: ctx.validatedScope?.contextVersion,
      agentThreadId: ctx.validatedScope?.threadId,
      brandId: parent.brandId ?? ctx.validatedScope?.brandId,
      category: child.category ?? PostCategory.TEXT,
      credentialId: parent.credentialId,
      description: child.description,
      ingredients: [],
      label: child.label,
      order: child.order,
      organizationId: ctx.organizationId,
      parentId: String(parent.id),
      platform: parsePlatform(parent.platform),
      source: 'agent',
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: ctx.userId,
      visibility: resolvePostVisibility(parent.visibility),
    };
  }

  /**
   * Keeps the closing @grok post last after the replies landed, and saves or
   * rewrites it when a question was given. A new closing post is only created
   * once every reply saved, so a failed batch never ends on a stray question.
   */
  private async settleClosingGrok(
    parent: PostDocument,
    ctx: ToolExecutionContext,
    plan: ThreadReplyPlan,
    savedCount: number,
    isComplete: boolean,
  ): Promise<string | undefined> {
    const order = plan.firstOrder + savedCount;
    const { grokChild } = plan;
    const description = isComplete ? plan.grokDescription : undefined;

    if (grokChild) {
      if (order !== grokChild.order || description !== undefined) {
        await this.postsService.patch(
          grokChild.id,
          { order, ...(description !== undefined ? { description } : {}) },
          [],
        );
      }
      return grokChild.id;
    }
    if (description === undefined) return undefined;

    const created = await this.postsService.create(
      this.buildChildDraft(parent, ctx, {
        description,
        label: GROK_FEEDBACK_LABEL,
        order,
      }),
      [],
    );
    return String(created.id);
  }

  private partialFailure(
    input: AddThreadPostsInput,
    plan: ThreadReplyPlan,
    saved: SavedThreadPost[],
    closingPostId: string | undefined,
  ): AgentToolResult {
    const remainingPosts = plan.toCreate
      .slice(saved.length)
      .map((reply) => reply.description);
    const isGrokPending =
      plan.grokDescription !== undefined && closingPostId === undefined;
    const nextCall = isGrokPending
      ? ' Call add_thread_posts again with only remainingPosts and the pending grokQuestion'
      : remainingPosts.length > 0
        ? ' Call add_thread_posts again with only remainingPosts'
        : ' The closing @grok post could not be moved to the end';
    return failure(
      `Saved ${saved.length} of ${plan.toCreate.length} replies before a save failed.${nextCall}; saved replies are not duplicated.`,
      {
        parentId: input.postId,
        ...(isGrokPending ? { pendingGrokQuestion: plan.grokDescription } : {}),
        remainingPosts,
        savedPosts: saved,
      },
    );
  }
}
