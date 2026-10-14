import { randomUUID } from 'node:crypto';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type {
  WorkflowPostGenerationDraft,
  WorkflowPostGenerationFailure,
  WorkflowPostGenerationInput,
  WorkflowPostGenerationResult,
  WorkflowPostGenerationTarget,
} from '@api/collections/workflows/services/workflow-post-generation.types';
import {
  buildWorkflowPostGenerationPrompt,
  buildWorkflowPostGenerationRequestKey,
} from '@api/collections/workflows/services/workflow-post-generation.util';
import { WorkflowActorMembershipVerifier } from '@api/collections/workflows/services/workflow-resume-actor.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { resolveAccountlessLearningReceipt } from '@api/services/branded-text-generation/accountless-learning-receipt.util';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type { BrandedTextGenerationOutcomeV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  fromPrismaCredentialPlatform,
  PostCategory,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ForbiddenException, Injectable } from '@nestjs/common';

/**
 * The text of an unattended workflow post. Every account gets its own branded
 * generation: one receipt and one provider call per post, saved as a DRAFT bound
 * to its receipt (#5786). A receipt that is not cleared (a provisional brand kit,
 * or validation that could not confirm) leaves the draft held for a member, and
 * the publish gate keeps it from going out unattended.
 */
@Injectable()
export class WorkflowPostGenerationService {
  private readonly membership: WorkflowActorMembershipVerifier;

  constructor(
    private readonly generation: BrandedTextGenerationService,
    private readonly modeResolver: BrandedModeResolverService,
    private readonly learningDecisions: LearningDecisionService,
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
    prisma: PrismaService,
  ) {
    this.membership = new WorkflowActorMembershipVerifier(prisma);
  }

  async generate(
    input: WorkflowPostGenerationInput,
  ): Promise<WorkflowPostGenerationResult> {
    const { brandId, context } = input;
    const targets = await this.resolveTargets(input);
    if (targets.length === 0) {
      throw new Error('postGen found no connected target credential');
    }
    const actor = {
      organizationId: context.organizationId,
      userId: context.userId,
    };
    const reauthorize = async (): Promise<void> => {
      if (
        !(await this.membership.isActiveMember(
          context.organizationId,
          context.userId,
        ))
      )
        throw new ForbiddenException('workflow_actor_revoked');
    };
    await reauthorize();
    const brandMode = await this.modeResolver.resolve(actor, brandId);
    const privateLearning = await resolveAccountlessLearningReceipt(
      this.learningDecisions,
      {
        brandId,
        organizationId: context.organizationId,
        originalPrompt: input.prompt,
      },
    );
    const originalPrompt = buildWorkflowPostGenerationPrompt(input);
    const groupId = randomUUID();
    const drafts: WorkflowPostGenerationDraft[] = [];
    const failures: WorkflowPostGenerationFailure[] = [];

    for (const target of targets) {
      const created: { id: string; label: string; status: string }[] = [];
      const outcome = await this.generation.generate({
        acceptText: () => true,
        initiatingActor: actor,
        input: {
          schemaVersion: 1,
          actorId: context.userId,
          organizationId: context.organizationId,
          brandId,
          requestKey: buildWorkflowPostGenerationRequestKey(
            context,
            input.nodeId,
            target.credentialId,
          ),
          candidateIndex: 0,
          surface: context.scheduledFireJobId ? 'schedule' : 'workflow',
          contentType: 'post',
          format: 'text',
          ...brandMode,
          originalPrompt,
          provider: 'openrouter',
          model: input.model,
          generationParameters: {
            maxTokens: input.maxTokens,
            temperature: input.temperature,
          },
          platform: target.platform,
          objective: 'engagement',
          destinationCredentialId: target.credentialId,
          knowledgeSourceIds: [],
          knowledgeSpaceIds: [],
          runId: context.runId,
          ...(context.executionId
            ? { workflowExecutionId: context.executionId }
            : {}),
        },
        persistText: async (text) => {
          const post = await this.postsService.create({
            brandId,
            category: PostCategory.TEXT,
            credentialId: target.credentialId,
            description: text,
            groupId,
            ingredients: [],
            ...(input.grounded
              ? { knowledgeReceipts: input.grounded.receipts }
              : {}),
            label: input.buildLabel(text),
            organizationId: context.organizationId,
            platform: parsePlatform(target.platform),
            source: 'workflow-post-generator',
            sourceWorkflowId: context.workflowId,
            targetExecutionState: TargetExecutionState.DRAFT,
            timezone: input.timezone,
            userId: context.userId,
            workflowExecutionId: context.executionId ?? context.runId,
          });
          const saved = {
            id: String(post.id),
            label: String(post.label ?? ''),
            status: String(post.status ?? ''),
          };
          created.push(saved);
          return { postId: saved.id };
        },
        privateLearning,
        reauthorize,
        resolveApiKey: async () => undefined,
      });
      const failure = this.toFailure(outcome, target);
      if (failure) {
        failures.push(failure);
        continue;
      }
      if (outcome.kind !== 'completed') continue;
      const saved = created[0]
        ? { ...created[0], description: outcome.text ?? '' }
        : await this.readSavedPost(input, outcome);
      const isHeld = outcome.receipt.state !== 'ready';
      drafts.push({
        credentialId: target.credentialId,
        description: saved.description,
        holdReason: isHeld
          ? outcome.receipt.mode === 'provisional_brand'
            ? 'provisional_brand'
            : 'needs_review'
          : null,
        id: saved.id,
        isHeldForReview: isHeld,
        label: saved.label,
        platform: target.platform,
        receiptId: outcome.receipt.id,
        status: saved.status,
      });
    }
    return { drafts, failures, groupId };
  }

  private toFailure(
    outcome: BrandedTextGenerationOutcomeV1,
    target: WorkflowPostGenerationTarget,
  ): WorkflowPostGenerationFailure | null {
    if (outcome.kind === 'completed') return null;
    return {
      credentialId: target.credentialId,
      reasonCode:
        outcome.kind === 'in_progress'
          ? 'branded_generation_in_progress'
          : outcome.reasonCode,
      receiptId: outcome.receipt.id,
    };
  }

  /** A replay finds its draft already saved; the post is the source of the text. */
  private async readSavedPost(
    input: WorkflowPostGenerationInput,
    outcome: Extract<BrandedTextGenerationOutcomeV1, { kind: 'completed' }>,
  ): Promise<{
    description: string;
    id: string;
    label: string;
    status: string;
  }> {
    const post = await this.postsService.findOne(
      {
        brandId: input.brandId,
        id: outcome.postId,
        isDeleted: false,
        organizationId: input.context.organizationId,
      },
      'none',
    );
    if (!post) throw new NotFoundException('receipt_artifact_not_found');
    return {
      description: String(post.description ?? ''),
      id: String(post.id),
      label: String(post.label ?? ''),
      status: String(post.status ?? ''),
    };
  }

  private async resolveTargets(
    input: WorkflowPostGenerationInput,
  ): Promise<WorkflowPostGenerationTarget[]> {
    const { brandId, context } = input;
    if (input.credentialId) {
      const credential = await this.credentialsService.findOne({
        brandId,
        id: input.credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId: context.organizationId,
      });
      if (!credential) return [];
      const platform = fromPrismaCredentialPlatform(
        String(credential.platform ?? ''),
      );
      if (!platform)
        throw new Error(
          `Unknown credential platform: ${String(credential.platform ?? '')}`,
        );
      return [{ credentialId: credential.id.toString(), platform }];
    }
    const platform = parsePlatform(input.platform);
    if (!platform) return [];
    const accounts = await this.credentialsService.findConnectedAccounts(
      context.organizationId,
      brandId,
      platform,
    );
    return accounts.map((account) => ({
      credentialId: account.id.toString(),
      platform,
    }));
  }
}
