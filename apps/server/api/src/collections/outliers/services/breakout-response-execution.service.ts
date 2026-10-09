import {
  type BreakoutGenerationPlanRequest,
  BreakoutGenerationPlanService,
} from '@api/collections/outliers/services/breakout-generation-plan.service';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { BreakoutTextOutputPreparationService } from '@api/collections/outliers/services/breakout-text-output-preparation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { BreakoutOutputRecoveryResult } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { ConflictException, Injectable } from '@nestjs/common';

/** Only the native pinned action producer may supply this admission, never an input JSON actor. */
export type BreakoutResponseExecutionRequest = BreakoutGenerationPlanRequest &
  Readonly<{
    workflowExecutionId: string;
  }>;
export type BreakoutResponseExecutionResult = {
  status: 'held' | 'completed' | 'processing';
  responseId: string;
  reason: string | null;
  outputs: Array<{ outputId: string; recovery: BreakoutOutputRecoveryResult }>;
};

/** The concrete native-action integration: normal pricing/reservation → execution binding → generation → retained recovery. */
@Injectable()
export class BreakoutResponseExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: BreakoutGenerationPlanService,
    private readonly text: BreakoutTextOutputPreparationService,
  ) {}

  async execute(
    request: BreakoutResponseExecutionRequest,
  ): Promise<BreakoutResponseExecutionResult> {
    await request.reauthorize(this.prisma);
    const plan = await this.planner.prepare(request);
    await request.reauthorize(this.prisma);
    if (plan.status === 'held') return this.held(request, plan.reason);
    const reservation = plan.reservation;
    if (!('outputIds' in reservation))
      return this.held(
        request,
        reservation.status === 'capacity_held'
          ? reservation.estimate.limits.join(',')
          : 'reason' in reservation
            ? reservation.reason
            : reservation.status,
      );
    if (
      reservation.outputIds.length < 1 ||
      reservation.outputIds.length > 5 ||
      new Set(reservation.outputIds).size !== reservation.outputIds.length
    )
      throw new ConflictException('breakout_execution_plan_conflict');
    const outputs: BreakoutResponseExecutionResult['outputs'] = [];
    for (const outputId of reservation.outputIds) {
      const output = await this.bindExecution(request, outputId);
      if (output.format !== 'text' && output.format !== 'thread') {
        await request.reauthorize(this.prisma);
        return {
          ...this.held(request, 'format_capability_unavailable'),
          outputs,
        };
      }
      if (output.state === 'reserved' && output.heldReason === null) {
        const outcome = await this.text.generate({
          textModelKey: plan.textModelKey,
          admission: {
            scope: {
              ...request.scope,
              strategyId: request.strategyId,
              format: output.format,
            },
            credentialId: request.scope.credentialId,
            responseId: request.responseId,
            outputId,
            workflowExecutionId: request.workflowExecutionId,
            actorUserId: request.actorUserId,
            componentKey: `${output.generationKey}:caption`,
            reauthorize: request.reauthorize,
          },
        });
        await request.reauthorize(this.prisma);
        outputs.push({
          outputId,
          recovery: await this.recovery(request, outputId),
        });
        // A retained ambiguous attempt is not permission to spend on a sibling before reconciliation.
        const recovery = outputs.at(-1)?.recovery;
        if (
          outcome.kind === 'in_progress' ||
          recovery?.status === 'unavailable' ||
          (recovery?.status === 'available' &&
            ['wait', 'reconcile'].includes(recovery.action))
        )
          return {
            status: 'processing',
            responseId: request.responseId,
            reason: 'provider_outcome_pending',
            outputs,
          };
        if (outcome.kind === 'stopped')
          return { ...this.held(request, outcome.reasonCode), outputs };
      } else {
        outputs.push({
          outputId,
          recovery: await this.recovery(request, outputId),
        });
        const recovery = outputs.at(-1)?.recovery;
        if (
          output.heldReason === 'quality_evaluation_pending' ||
          recovery?.status === 'unavailable' ||
          (recovery?.status === 'available' &&
            ['wait', 'reconcile'].includes(recovery.action))
        )
          return {
            status: 'processing',
            responseId: request.responseId,
            reason: recovery?.reason ?? output.heldReason,
            outputs,
          };
      }
    }
    await request.reauthorize(this.prisma);
    return {
      status: 'completed',
      responseId: request.responseId,
      reason: null,
      outputs,
    };
  }

  private held(
    request: BreakoutResponseExecutionRequest,
    reason: string,
  ): BreakoutResponseExecutionResult {
    return {
      status: 'held',
      responseId: request.responseId,
      reason,
      outputs: [],
    };
  }

  private async bindExecution(
    request: BreakoutResponseExecutionRequest,
    outputId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await request.reauthorize(tx);
        // Use the registry's parent lock, so another root cannot replace any immutable slot binding.
        await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "breakout_responses" WHERE "id" = ${request.responseId}
          AND "organizationId" = ${request.scope.organizationId} AND "brandId" = ${request.scope.brandId}
          AND "credentialId" = ${request.scope.credentialId} AND "platform" = ${request.scope.platform}
          AND "state" = 'planned' AND "isDeleted" = false FOR UPDATE
      `);
        const response = await tx.breakoutResponse.findFirst({
          where: {
            ...request.scope,
            id: request.responseId,
            state: 'planned',
            isDeleted: false,
          },
          select: { outputPlanFingerprint: true },
        });
        await request.reauthorize(tx);
        if (!response?.outputPlanFingerprint)
          throw new ConflictException(
            'breakout_execution_response_unavailable',
          );
        const execution = await tx.workflowExecution.findFirst({
          where: {
            id: request.workflowExecutionId,
            organizationId: request.scope.organizationId,
            userId: request.actorUserId,
            isDeleted: false,
            status: {
              in: [
                WorkflowExecutionStatus.PENDING,
                WorkflowExecutionStatus.RUNNING,
              ],
            },
          },
          select: { id: true },
        });
        await request.reauthorize(tx);
        if (!execution)
          throw new ConflictException('breakout_execution_unavailable');
        const where = {
          id: outputId,
          responseId: request.responseId,
          organizationId: request.scope.organizationId,
          brandId: request.scope.brandId,
          credentialId: request.scope.credentialId,
          isDeleted: false,
        };
        const output = await tx.breakoutResponseOutput.findFirst({ where });
        await request.reauthorize(tx);
        if (!output || output.ordinal < 1 || output.ordinal > 5)
          throw new ConflictException('breakout_execution_output_unavailable');
        if (
          output.workflowExecutionId !== null &&
          output.workflowExecutionId !== execution.id
        )
          throw new ConflictException('breakout_execution_binding_conflict');
        if (output.workflowExecutionId === null) {
          if (output.state !== 'reserved')
            throw new ConflictException('breakout_execution_binding_conflict');
          await request.reauthorize(tx);
          const changed = await tx.breakoutResponseOutput.updateMany({
            where: {
              ...where,
              workflowExecutionId: null,
              state: 'reserved',
              generationKey: output.generationKey,
            },
            data: { workflowExecutionId: execution.id },
          });
          if (changed.count !== 1)
            throw new ConflictException('breakout_execution_binding_conflict');
        }
        await request.reauthorize(tx);
        return output;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async recovery(
    request: BreakoutResponseExecutionRequest,
    outputId: string,
  ) {
    await request.reauthorize(this.prisma);
    const recovery = await readBreakoutOutputRecovery(this.prisma, {
      ...request.scope,
      responseId: request.responseId,
      outputId,
    });
    await request.reauthorize(this.prisma);
    return recovery;
  }
}
