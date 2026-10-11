import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { scoreTextPublishGate } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type { OptimizerAnalysisResult } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { OptimizerAnalysisContinuation } from '@api/collections/optimizers/services/optimizer-analysis-continuation.types';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import {
  admitBreakoutGenerationContinuation,
  type BreakoutGenerationAdmission,
  runWithBreakoutGenerationAdmission,
} from '@api/collections/outliers/services/breakout-generation-admission.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import {
  isBreakoutMediaFormat,
  resolveBreakoutMediaFormat,
} from '@api/collections/outliers/services/breakout-media-format.util';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import {
  breakoutLayoutText,
  breakoutQualityMaterialHash,
} from '@api/collections/outliers/services/breakout-quality-material.util';
import {
  type BreakoutVisualPart,
  BreakoutVisualQualityService,
} from '@api/collections/outliers/services/breakout-visual-quality.service';
import {
  breakoutVisualEvidenceMeetsPolicy,
  DEFAULT_BREAKOUT_MIN_VISUAL_SCORE,
  readBreakoutVisualEvidence,
} from '@api/collections/outliers/services/breakout-visual-quality.util';
import {
  brandedPostMaterialSelect,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_HOLD_TTL_MS,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { ConflictException, Injectable } from '@nestjs/common';

export type BreakoutOutputQualityRequest = Readonly<{
  admission: Readonly<BreakoutGenerationAdmission>;
  postId: string;
}>;
export type BreakoutOutputQualityResult = Readonly<{
  state: 'approved' | 'held' | 'reconciliation_required';
  scoreId: string | null;
}>;

/** Runs the existing strategy quality gate on retained canonical text/thread material. Never publishes. */
@Injectable()
export class BreakoutOutputQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategies: AgentStrategiesService,
    private readonly optimizers: OptimizersService,
    private readonly credits: CreditsUtilsService,
    private readonly visual: BreakoutVisualQualityService,
  ) {}

  async evaluate(
    request: BreakoutOutputQualityRequest,
  ): Promise<BreakoutOutputQualityResult> {
    const { admission } = request;
    const prepared = await this.prepare(request);
    const existing = await this.readScore(request, prepared.binding);
    if (existing) {
      // A visual output's caption score is not enough: an interrupted visual evaluation is an
      // unknown paid outcome and is reconciled, never repeated.
      if (
        prepared.parts.length > 0 &&
        !(
          await readBreakoutVisualEvidence(
            this.prisma,
            admission.scope.organizationId,
            prepared.binding,
            prepared.parts.length,
          )
        ).isComplete
      )
        return { state: 'reconciliation_required', scoreId: null };
      return this.applyGate(request, existing, prepared);
    }
    const claim = await this.claimAttempt(admission);
    if (!claim.won) return { state: 'reconciliation_required', scoreId: null };
    const component = {
      ...admission,
      componentKey: `${claim.generationKey}:quality`,
    };
    const budget = await this.readBudget(admission);
    let attempts = 0;
    let reservationId: string | undefined;
    let maximumCredits = 0;
    const continuation: OptimizerAnalysisContinuation = {
      scoreBinding: prepared.binding,
      reauthorize: async () => {
        const current = await this.prepare(request);
        if (current.binding.materialHash !== prepared.binding.materialHash)
          throw new ConflictException('breakout_quality_material_changed');
      },
      beforeAttempt: async (amount) => {
        if (++attempts > 1)
          throw new ConflictException('breakout_quality_paid_retry_held');
        maximumCredits = amount;
        await this.prisma.$transaction((tx) =>
          admitBreakoutGenerationContinuation(tx, component, amount),
        );
        if (amount === 0) return;
        const hold = await this.credits.reserveCredits({
          organizationId: admission.scope.organizationId,
          brandId: admission.scope.brandId,
          actorUserId: admission.actorUserId,
          amount,
          idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${component.componentKey}`,
          workloadId: component.componentKey,
          workloadType: GENERATION_POOL_WORKLOAD_TYPE,
          source: ActivitySource.SCRIPT,
          description: 'Breakout response quality evaluation',
          expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
        });
        if (hold.status !== CreditReservationStatus.RESERVED)
          throw new ConflictException('breakout_quality_hold_not_dispatchable');
        reservationId = hold.id;
      },
      acceptedAttempt: async (amount) => {
        if (!Number.isFinite(amount) || amount < 0 || amount > maximumCredits)
          throw new ConflictException(
            'breakout_quality_charge_needs_reconciliation',
          );
        if (!reservationId) {
          if (amount !== 0)
            throw new ConflictException('breakout_quality_hold_missing');
          return;
        }
        await this.credits.settleReservation({
          organizationId: admission.scope.organizationId,
          brandId: admission.scope.brandId,
          actorUserId: admission.actorUserId,
          reservationId,
          actualAmount: amount,
          source: ActivitySource.SCRIPT,
          description: 'Breakout response quality evaluation',
          settlementIdempotencyKey: `${component.componentKey}:settled`,
        });
      },
    };
    await runWithBreakoutGenerationAdmission(
      this.prisma,
      component,
      async () => {
        await this.optimizers.analyzeContent(
          {
            content: prepared.content,
            contentType: 'caption',
            platform: admission.scope.platform,
            goals: ['engagement', 'reach'],
          },
          admission.scope.organizationId,
          admission.actorUserId,
          undefined,
          budget,
          continuation,
        );
      },
    );
    if (prepared.parts.length > 0)
      await this.visual.evaluate({
        admission,
        binding: prepared.binding,
        generationKey: claim.generationKey,
        caption: prepared.content,
        parts: prepared.parts,
        maximumCredits: budget,
      });
    const score = await this.readScore(request, prepared.binding);
    if (!score) return { state: 'reconciliation_required', scoreId: null };
    return this.applyGate(request, score, prepared);
  }

  /** One claim per output: a held reason marks the single paid quality attempt as taken. */
  private async claimAttempt(
    admission: Readonly<BreakoutGenerationAdmission>,
  ): Promise<{ won: boolean; generationKey: string }> {
    return this.prisma.$transaction(async (tx) => {
      await admitBreakoutGenerationContinuation(tx, admission);
      const output = await tx.breakoutResponseOutput.findFirst({
        where: scopedWhere(
          admission.scope.organizationId,
          this.outputWhere(admission),
        ),
        select: { generationKey: true },
      });
      await admission.reauthorize(tx);
      if (!output)
        throw new ConflictException('breakout_quality_output_unavailable');
      const changed = await tx.breakoutResponseOutput.updateMany({
        where: scopedWhere(admission.scope.organizationId, {
          ...this.outputWhere(admission),
          state: { in: ['reserved', 'generating'] },
          heldReason: null,
        }),
        data: { heldReason: 'quality_evaluation_pending' },
      });
      await admission.reauthorize(tx);
      return { won: changed.count === 1, generationKey: output.generationKey };
    });
  }

  /** The smallest remaining budget the output's scope allows one quality attempt to spend. */
  private async readBudget(
    admission: Readonly<BreakoutGenerationAdmission>,
  ): Promise<number> {
    const capacity = await this.prisma.$transaction(async (tx) => {
      await admission.reauthorize(tx);
      const snapshot = await readBreakoutLiveCapacity(tx, {
        ...admission.scope,
        credentialId: admission.credentialId,
        nowMs: Date.now(),
      });
      await admission.reauthorize(tx);
      return snapshot;
    });
    if (capacity.status !== 'available')
      throw new ConflictException('breakout_quality_budget_unavailable');
    const remaining = [
      capacity.budget.remainingDailyCredits,
      capacity.budget.remainingWeeklyCredits,
      capacity.budget.remainingMonthlyCredits,
      capacity.budget.remainingPlatformCredits,
      capacity.budget.remainingPacingCredits,
      capacity.budget.availableOrganizationCredits,
      ...(capacity.budget.remainingFormatCredits[admission.scope.format] ===
      undefined
        ? []
        : [capacity.budget.remainingFormatCredits[admission.scope.format]]),
    ];
    if (remaining.some((value) => value === null || !Number.isFinite(value)))
      throw new ConflictException('breakout_quality_budget_unavailable');
    return Math.min(...remaining.map((value) => value ?? 0));
  }

  private outputWhere(admission: Readonly<BreakoutGenerationAdmission>) {
    return {
      id: admission.outputId,
      responseId: admission.responseId,
      organizationId: admission.scope.organizationId,
      brandId: admission.scope.brandId,
      credentialId: admission.credentialId,
      workflowExecutionId: admission.workflowExecutionId,
      format: admission.scope.format,
      isDeleted: false,
    };
  }

  private async prepare(
    request: BreakoutOutputQualityRequest,
    client?: Prisma.TransactionClient,
  ) {
    const { admission, postId } = request;
    const { scope } = admission;
    const media = isBreakoutMediaFormat(scope.format)
      ? resolveBreakoutMediaFormat(scope.platform, scope.format)
      : null;
    if (
      media
        ? media.status !== 'supported'
        : scope.format !== 'text' && scope.format !== 'thread'
    )
      throw new ConflictException('breakout_quality_format_unavailable');
    const read = async (tx: Prisma.TransactionClient) => {
      await admission.reauthorize(tx);
      const recovery = await readBreakoutOutputRecovery(tx, {
        ...scope,
        responseId: admission.responseId,
        outputId: admission.outputId,
        credentialId: admission.credentialId,
      });
      if (
        recovery.status !== 'available' ||
        recovery.postId !== postId ||
        !['draft', 'awaiting_review', 'reconciliation_required'].includes(
          recovery.state,
        ) ||
        ![
          'publication_admission_required',
          'platform_quality_blocked',
          'quality_evaluation_pending',
          // Held for a member's review, but already paid for: still scored, so the evidence the
          // publication gate needs exists the moment a member approves it.
          'brand_review_required',
        ].includes(recovery.reason)
      )
        throw new ConflictException('breakout_quality_artifact_unavailable');
      await admission.reauthorize(tx);
      const post = await tx.post.findFirst({
        where: {
          id: postId,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          credentialId: admission.credentialId,
          platform: scope.platform,
          parentId: null,
          breakoutOutputId: admission.outputId,
          isDeleted: false,
        },
        select: brandedPostMaterialSelect,
      });
      await admission.reauthorize(tx);
      if (!post)
        throw new ConflictException('breakout_quality_artifact_unavailable');
      const layout = describeBrandedPostMaterialLayout(scope, post);
      const mediaEntries = layout.entries.filter(
        (entry) => entry.kind === 'media',
      );
      const plan = media?.status === 'supported' ? media.plan : null;
      if (
        layout.format !== scope.format ||
        (plan
          ? mediaEntries.length !== plan.parts ||
            layout.entries.length !== mediaEntries.length ||
            mediaEntries.some((entry) => entry.role !== plan.mediaKind)
          : mediaEntries.length > 0 ||
            layout.entries.some((entry) => entry.kind !== 'text'))
      )
        throw new ConflictException('breakout_quality_material_changed');
      const content = breakoutLayoutText(layout);
      if (!content.trim())
        throw new ConflictException('breakout_quality_material_unavailable');
      // Each attached visual's judged address, in the post's own attachment order.
      const parts: BreakoutVisualPart[] = mediaEntries.map((entry) => {
        const url = Reflect.get(
          post.ingredients.find((item) => item.s3Key === entry.id) ?? {},
          'cdnUrl',
        );
        if (typeof url !== 'string' || !url)
          throw new ConflictException('breakout_quality_material_unavailable');
        return {
          url,
          mediaKind: plan?.mediaKind ?? 'image',
          durationSeconds: plan?.durationSeconds ?? null,
        };
      });
      return {
        content,
        parts,
        binding: {
          responseId: admission.responseId,
          outputId: admission.outputId,
          postId,
          strategyId: scope.strategyId,
          workflowExecutionId: admission.workflowExecutionId,
          materialHash: breakoutQualityMaterialHash(layout, content),
        },
      };
    };
    return client ? read(client) : this.prisma.$transaction(read);
  }

  private async readScore(
    request: BreakoutOutputQualityRequest,
    binding: OptimizerAnalysisContinuation['scoreBinding'],
  ) {
    await request.admission.reauthorize(this.prisma);
    const row = await this.prisma.contentScore.findFirst({
      where: {
        organizationId: request.admission.scope.organizationId,
        isDeleted: false,
        data: { path: ['breakoutQuality'], equals: { ...binding } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    await request.admission.reauthorize(this.prisma);
    return row;
  }

  private async applyGate(
    request: BreakoutOutputQualityRequest,
    score: { id: string; data: Prisma.JsonValue },
    prepared: Awaited<ReturnType<BreakoutOutputQualityService['prepare']>>,
  ): Promise<BreakoutOutputQualityResult> {
    const { admission } = request;
    await admission.reauthorize(this.prisma);
    const strategy = await this.strategies.findOneById(
      admission.scope.strategyId,
      admission.scope.organizationId,
    );
    await admission.reauthorize(this.prisma);
    const analysis = readRecord(score.data);
    const threshold = strategy?.publishPolicy?.minPostScore ?? 70;
    if (
      !strategy?.isActive ||
      strategy.isEnabled === false ||
      strategy.brandId !== admission.scope.brandId ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 100 ||
      typeof analysis.overallScore !== 'number' ||
      !Number.isFinite(analysis.overallScore) ||
      analysis.overallScore < 0 ||
      analysis.overallScore > 100
    )
      throw new ConflictException('breakout_quality_policy_unavailable');
    const gate = scoreTextPublishGate(
      strategy,
      String(analysis.content ?? ''),
      analysis as OptimizerAnalysisResult,
    );
    const isApproved = await this.prisma.$transaction(async (tx) => {
      await admission.reauthorize(tx);
      const key = `agent-strategy-config:${admission.scope.strategyId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      await admission.reauthorize(tx);
      const current = await tx.agentStrategy.findFirst({
        where: {
          id: admission.scope.strategyId,
          organizationId: admission.scope.organizationId,
          brandId: admission.scope.brandId,
          isDeleted: false,
          isActive: true,
        },
        select: { config: true, policies: true },
      });
      await admission.reauthorize(tx);
      if (!current)
        throw new ConflictException('breakout_quality_policy_unavailable');
      const policy = {
        ...readRecord(current.config),
        ...readRecord(current.policies),
      };
      const publishPolicy = readRecord(policy.publishPolicy);
      if (
        policy.isEnabled === false ||
        (publishPolicy.minPostScore ?? 70) !== threshold ||
        (publishPolicy.minImageScore ?? DEFAULT_BREAKOUT_MIN_VISUAL_SCORE) !==
          (strategy.publishPolicy?.minImageScore ??
            DEFAULT_BREAKOUT_MIN_VISUAL_SCORE) ||
        policy.goalProfile !== strategy.goalProfile
      )
        throw new ConflictException('breakout_quality_policy_changed');
      const material = await this.prepare(request, tx);
      const scoreBinding = readRecord(analysis.breakoutQuality);
      if (
        analysis.content !== material.content ||
        Object.entries(material.binding).some(
          ([key, value]) => scoreBinding[key] !== value,
        ) ||
        Object.keys(scoreBinding).length !==
          Object.keys(material.binding).length
      )
        throw new ConflictException('breakout_quality_material_changed');
      // Every attached visual must also reach the configured bar, on evidence read fresh here.
      const approved =
        gate.decision === 'approved' &&
        (prepared.parts.length === 0 ||
          breakoutVisualEvidenceMeetsPolicy(
            await readBreakoutVisualEvidence(
              tx,
              admission.scope.organizationId,
              material.binding,
              prepared.parts.length,
            ),
            strategy.publishPolicy?.minImageScore,
          ));
      const changed = await tx.breakoutResponseOutput.updateMany({
        where: scopedWhere(admission.scope.organizationId, {
          ...this.outputWhere(admission),
          state: { in: ['reserved', 'generating', 'awaiting_review'] },
          OR: [
            { heldReason: null },
            {
              heldReason: {
                in: ['quality_evaluation_pending', 'platform_quality_blocked'],
              },
            },
          ],
        }),
        data: {
          state: approved ? 'generating' : 'awaiting_review',
          heldReason: approved ? null : 'platform_quality_blocked',
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('breakout_quality_output_changed');
      await admission.reauthorize(tx);
      return approved;
    });
    return {
      state: isApproved ? 'approved' : 'held',
      scoreId: score.id,
    };
  }
}
