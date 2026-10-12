import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { discardUnlinkedBreakoutDraft } from '@api/collections/outliers/services/breakout-draft-discard.util';
import {
  admitBreakoutGenerationContinuation,
  type BreakoutGenerationAdmission,
  runWithBreakoutGenerationAdmission,
} from '@api/collections/outliers/services/breakout-generation-admission.util';
import { isBreakoutMediaFormat } from '@api/collections/outliers/services/breakout-media-format.util';
import { BreakoutOutputQualityService } from '@api/collections/outliers/services/breakout-output-quality.service';
import { bindBreakoutPostArtifact } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { BreakoutReviewHandoffService } from '@api/collections/outliers/services/breakout-review-handoff.service';
import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type {
  BrandedTextGenerationOutcomeV1,
  BrandedTextGenerationRequestV1,
} from '@api/services/branded-text-generation/branded-text-generation.types';
import { textDispatchApiKey } from '@api/services/byok/text-dispatch-byok.util';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  GENERATE_CONTENT_TEXT_CREDITS,
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_HOLD_TTL_MS,
} from '@genfeedai/contracts/constants';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/** Prepared internally from a pinned execution; never a controller DTO or serialized authority. */
export type BreakoutTextOutputGenerationRequest = {
  admission: Readonly<BreakoutGenerationAdmission>;
  input: BrandedTextGenerationRequestV1['input'];
  privateLearning: BrandedTextGenerationRequestV1['privateLearning'];
  label: string;
  acceptSegment: (text: string) => boolean;
  /**
   * The text is the caption of a visual output (image, carousel, video, short). Its draft is a
   * plain text post that the output's composition later turns into the visual post, so it is
   * neither bound to the output nor quality-scored here: both happen on the composed material.
   */
  isVisualCaption?: boolean;
};

function segments(text: string, thread: boolean): string[] {
  return thread
    ? text
        .split(/\n{2,}/u)
        .map((part) => part.trim())
        .filter(Boolean)
    : [text];
}

/** Actual text provider, wallet hold, canonical draft and response-lineage consumer. */
@Injectable()
export class BreakoutTextOutputGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: BrandedTextGenerationService,
    private readonly textCredits: TextGenerationCreditsService,
    private readonly credits: CreditsUtilsService,
    private readonly posts: PostsService,
    private readonly quality: BreakoutOutputQualityService,
    private readonly review: BreakoutReviewHandoffService,
  ) {}

  async generate(
    request: Readonly<BreakoutTextOutputGenerationRequest>,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    const { admission, input } = request;
    const { scope } = admission;
    const isCaption = request.isVisualCaption === true;
    if (
      (isCaption
        ? !isBreakoutMediaFormat(scope.format) || input.format !== 'text'
        : (scope.format !== 'text' && scope.format !== 'thread') ||
          input.format !== scope.format) ||
      input.mode !== 'approved_brand' ||
      input.organizationId !== scope.organizationId ||
      input.brandId !== scope.brandId ||
      input.actorId !== admission.actorUserId ||
      input.platform !== scope.platform ||
      input.destinationCredentialId !== admission.credentialId ||
      input.workflowExecutionId !== admission.workflowExecutionId ||
      input.candidateIndex !== 0 ||
      admission.componentKey !== `${input.requestKey}:caption`
    )
      throw new BadRequestException('breakout_text_request_scope_changed');
    const assertGeneration = () =>
      this.prisma.$transaction(async (tx) => {
        await admitBreakoutGenerationContinuation(tx, admission);
        const output = await tx.breakoutResponseOutput.findFirst({
          where: {
            id: admission.outputId,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            credentialId: admission.credentialId,
            responseId: admission.responseId,
            isDeleted: false,
          },
          select: { generationKey: true },
        });
        if (output?.generationKey !== input.requestKey)
          throw new ConflictException('breakout_generation_key_changed');
      });
    const reauthorize = () => admission.reauthorize(this.prisma);
    await assertGeneration();
    return runWithBreakoutGenerationAdmission(
      this.prisma,
      admission,
      async () => {
        let reservationId: string | undefined;
        let usesByok = false;
        const normal: BrandedTextGenerationRequestV1 = {
          initiatingActor: {
            userId: admission.actorUserId,
            organizationId: scope.organizationId,
          },
          input,
          privateLearning: request.privateLearning,
          reauthorize,
          resolveApiKey: async (model) => {
            await assertGeneration();
            const dispatch = await this.textCredits.resolveDispatch(
              scope.organizationId,
              [model],
            );
            await reauthorize();
            usesByok = dispatch !== undefined;
            return textDispatchApiKey(dispatch, model);
          },
          admitDispatch: async () => {
            await assertGeneration();
            if (usesByok) return;
            const hold = await this.credits.reserveCredits({
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              actorUserId: admission.actorUserId,
              amount: GENERATE_CONTENT_TEXT_CREDITS,
              idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${admission.componentKey}`,
              workloadId: admission.componentKey,
              workloadType: GENERATION_POOL_WORKLOAD_TYPE,
              source: ActivitySource.SCRIPT,
              description: 'Breakout response text generation',
              expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
            });
            if (hold.status !== CreditReservationStatus.RESERVED)
              throw new ConflictException(
                'breakout_text_hold_not_dispatchable',
              );
            reservationId = hold.id;
          },
          acceptText: (text) => {
            const parts = segments(text, input.format === 'thread');
            return (
              parts.length >= (input.format === 'thread' ? 2 : 1) &&
              parts.length <= 9 &&
              parts.every(request.acceptSegment)
            );
          },
          persistText: (text) => this.persistDraft(request, text),
        };
        const outcome =
          input.format === 'thread'
            ? await this.generation.generateThread(normal)
            : await this.generation.generate(normal);
        // A retained accepted attempt is billable even if its output failed a channel/quality gate.
        // Missing/ambiguous attempts retain their hold; hasNewDispatch=false is never a release proof.
        if (outcome.receipt.execution?.providerAttemptRef) {
          const retained = reservationId
            ? null
            : await this.credits.findReservationForWorkload({
                organizationId: scope.organizationId,
                workloadId: admission.componentKey,
                workloadType: GENERATION_POOL_WORKLOAD_TYPE,
              });
          const id = reservationId ?? retained?.id;
          if (id)
            await this.credits.settleReservation({
              organizationId: scope.organizationId,
              reservationId: id,
              actualAmount: GENERATE_CONTENT_TEXT_CREDITS,
              actorUserId: admission.actorUserId,
              brandId: scope.brandId,
              description: 'Breakout response text generation',
              source: ActivitySource.SCRIPT,
              settlementIdempotencyKey: `${admission.componentKey}:settled`,
            });
        }
        // Every persisted draft was paid for. It is linked to its output, or it is discarded:
        // never left as an unlinked draft that nothing can find, review or recover.
        const settled =
          outcome.kind === 'in_progress'
            ? outcome
            : isCaption
              ? await this.keepCaption(request, outcome)
              : await this.keepDraft(request, outcome);
        await admission.reauthorize(this.prisma);
        return settled;
      },
    );
  }

  /**
   * Links the persisted draft to its output, then queues it for the human review its receipt
   * calls for and runs the quality gate. A blocked draft stays linked and held. A draft that
   * cannot be linked is discarded, and the outcome says why.
   */
  private async keepDraft(
    request: Readonly<BreakoutTextOutputGenerationRequest>,
    outcome: Exclude<BrandedTextGenerationOutcomeV1, { kind: 'in_progress' }>,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    const { admission } = request;
    const { scope } = admission;
    const postId = outcome.postId;
    if (!postId) return outcome;
    const bound = await this.prisma.$transaction(async (tx) => {
      await admission.reauthorize(tx);
      return bindBreakoutPostArtifact(tx, {
        ...scope,
        credentialId: admission.credentialId,
        responseId: admission.responseId,
        outputId: admission.outputId,
        postId,
      });
    });
    if (bound.status === 'held') {
      await discardUnlinkedBreakoutDraft(this.prisma, admission, postId);
      return {
        kind: 'stopped',
        receipt: outcome.receipt,
        postId: null,
        reasonCode: `breakout_artifact_binding_held:${bound.reason}`,
        hasNewDispatch: outcome.hasNewDispatch,
      };
    }
    if (outcome.kind === 'stopped') return outcome;
    // A draft with an unbacked claim (or no fact check) leaves factual coverage unverified, so a draft the
    // receipt did not clear goes to a member's review instead of failing the response.
    if (
      outcome.receipt.state !== 'ready' ||
      outcome.receipt.compliance !== 'passed'
    )
      await this.review.queue(admission, {
        postId,
        generationKey: request.input.requestKey,
      });
    await this.quality.evaluate({ admission, postId });
    return outcome;
  }

  /**
   * A visual output's caption is only a draft until composition links the finished visual post.
   * A caption the receipt stopped has nothing to compose, so it is discarded.
   */
  private async keepCaption(
    request: Readonly<BreakoutTextOutputGenerationRequest>,
    outcome: Exclude<BrandedTextGenerationOutcomeV1, { kind: 'in_progress' }>,
  ): Promise<BrandedTextGenerationOutcomeV1> {
    if (outcome.kind === 'stopped' && outcome.postId)
      await discardUnlinkedBreakoutDraft(
        this.prisma,
        request.admission,
        outcome.postId,
      );
    return outcome;
  }

  private async persistDraft(
    request: Readonly<BreakoutTextOutputGenerationRequest>,
    text: string,
  ): Promise<{ postId: string }> {
    const { admission, input } = request;
    const { scope } = admission;
    await admission.reauthorize(this.prisma);
    const parts = segments(text, input.format === 'thread');
    const drafts: PostCreateInput[] = parts.map((description, order) => ({
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: admission.credentialId,
      platform: scope.platform,
      userId: admission.actorUserId,
      workflowExecutionId: admission.workflowExecutionId,
      agentStrategyId: scope.strategyId,
      sourceActionId: `${input.requestKey}:post:${order}`,
      label: request.label,
      description,
      ingredients: [],
      category: PostCategory.TEXT,
      format:
        input.format === 'thread' ? PostFormat.THREAD : PostFormat.STANDARD,
      targetExecutionState: TargetExecutionState.DRAFT,
    }));
    // Recheck before each canonical child write instead of creating a whole thread under stale authority.
    const first = drafts[0];
    if (!first) throw new BadRequestException('breakout_text_output_empty');
    const root = await this.posts.create({ ...first, order: 0 }, []);
    try {
      for (const [index, draft] of drafts.slice(1).entries()) {
        await admission.reauthorize(this.prisma);
        await this.posts.create(
          { ...draft, parentId: root.id, order: index + 1 },
          [],
        );
      }
      await admission.reauthorize(this.prisma);
    } catch (error: unknown) {
      // The receipt fails without a draft id when a segment write fails, so a partly written
      // thread would be a paid draft nothing refers to. Discard it before reporting the failure.
      // A revoked actor may not write at all; the original failure is the one reported.
      await discardUnlinkedBreakoutDraft(this.prisma, admission, root.id).catch(
        () => undefined,
      );
      throw error;
    }
    return { postId: root.id };
  }
}
