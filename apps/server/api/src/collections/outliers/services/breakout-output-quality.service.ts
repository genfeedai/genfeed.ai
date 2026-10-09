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
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  brandedPostMaterialSelect,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
  ) {}

  async evaluate(
    request: BreakoutOutputQualityRequest,
  ): Promise<BreakoutOutputQualityResult> {
    const { admission } = request;
    const prepared = await this.prepare(request);
    const existing = await this.readScore(request, prepared.binding);
    if (existing) return this.applyGate(request, existing);
    const claim = await this.prisma.$transaction(async (tx) => {
      await admitBreakoutGenerationContinuation(tx, admission);
      const output = await tx.breakoutResponseOutput.findFirst({
        where: this.outputWhere(admission),
        select: { generationKey: true },
      });
      await admission.reauthorize(tx);
      if (!output)
        throw new ConflictException('breakout_quality_output_unavailable');
      const changed = await tx.breakoutResponseOutput.updateMany({
        where: {
          ...this.outputWhere(admission),
          state: { in: ['reserved', 'generating'] },
          heldReason: null,
        },
        data: { heldReason: 'quality_evaluation_pending' },
      });
      await admission.reauthorize(tx);
      return { won: changed.count === 1, generationKey: output.generationKey };
    });
    if (!claim.won) return { state: 'reconciliation_required', scoreId: null };
    const component = {
      ...admission,
      componentKey: `${claim.generationKey}:quality`,
    };
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
    const budget = Math.min(...remaining.map((value) => value ?? 0));
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
    const score = await this.readScore(request, prepared.binding);
    if (!score) return { state: 'reconciliation_required', scoreId: null };
    return this.applyGate(request, score);
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
    if (scope.format !== 'text' && scope.format !== 'thread')
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
      if (
        layout.format !== scope.format ||
        layout.entries.some((entry) => entry.kind !== 'text')
      )
        throw new ConflictException('breakout_quality_material_changed');
      const content = [
        layout.textBytes,
        ...layout.entries.map((entry) =>
          entry.kind === 'text' ? entry.bytes : null,
        ),
      ]
        .filter((bytes): bytes is Uint8Array => bytes !== null)
        .map((bytes) => Buffer.from(bytes).toString('utf8'))
        .join('\n\n');
      if (!content.trim())
        throw new ConflictException('breakout_quality_material_unavailable');
      return {
        content,
        binding: {
          responseId: admission.responseId,
          outputId: admission.outputId,
          postId,
          strategyId: scope.strategyId,
          workflowExecutionId: admission.workflowExecutionId,
          materialHash: hashBrandedGenerationTextV1(content),
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
    await this.prisma.$transaction(async (tx) => {
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
      const changed = await tx.breakoutResponseOutput.updateMany({
        where: {
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
        },
        data: {
          state:
            gate.decision === 'approved' ? 'generating' : 'awaiting_review',
          heldReason:
            gate.decision === 'approved' ? null : 'platform_quality_blocked',
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('breakout_quality_output_changed');
      await admission.reauthorize(tx);
    });
    return {
      state: gate.decision === 'approved' ? 'approved' : 'held',
      scoreId: score.id,
    };
  }
}
