import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';

const WORKFLOWS = {
  'analytics-sync': {
    canonicalId: 'analytics-sync',
    interval: 6 * 60 * 60 * 1000,
  },
  'content-loop-autopilot': {
    canonicalId: 'content-loop-autopilot',
    interval: 24 * 60 * 60 * 1000,
  },
  'proactive-agent-strategies': {
    canonicalId: 'agent.autopilot.proactive',
    interval: 60 * 1000,
  },
} as const;

@Injectable()
export class PlatformWorkflowSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_WORKFLOW_RUNNER)
    private readonly runner: SystemWorkflowRunnerService,
    private readonly logger: LoggerService,
    private readonly continuations: WorkflowContinuationReconcileService,
  ) {}

  async reconcileContinuations(): Promise<void> {
    await this.continuations.reconcile();
  }

  async sweep(
    templateId: keyof typeof WORKFLOWS,
    timestamp: number,
  ): Promise<void> {
    const { canonicalId, interval } = WORKFLOWS[templateId];
    const slot = Math.floor(timestamp / interval);
    const failures: Error[] = [];
    let cursor: string | undefined;
    while (true) {
      const organizations = await this.prisma.organization.findMany({
        where: { isDeleted: false, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: 100,
        select: { id: true, userId: true },
      });
      for (const organization of organizations) {
        try {
          // Paused and soft-deleted installations remain explicit tenant controls.
          // tenant-scope-ignore: D1 treats deleted installations as tenant opt-out controls; the organization filter remains mandatory
          const installed = await this.prisma.workflow.findFirst({
            where: {
              organizationId: organization.id,
              OR: [
                {
                  metadata: { path: ['sourceTemplateId'], equals: templateId },
                },
                {
                  metadata: {
                    path: ['systemWorkflow', 'canonicalId'],
                    equals: templateId,
                  },
                },
                {
                  metadata: {
                    path: ['systemWorkflow', 'canonicalId'],
                    equals: canonicalId,
                  },
                },
              ],
            },
            select: { id: true },
          });
          if (installed) continue;
          await this.runner.enqueueWorkflow({
            actionType: canonicalId,
            canonicalId,
            idempotencyKey: `platform:${templateId}:${organization.id}:${slot}`,
            organizationId: organization.id,
            userId: organization.userId,
            source: 'PlatformWorkflowSchedulesService',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
          });
        } catch (error) {
          const failure = new Error(
            `Platform workflow ${templateId} failed for organization ${organization.id}`,
            { cause: error },
          );
          failures.push(failure);
          this.logger.error(failure.message, {
            error,
            organizationId: organization.id,
          });
        }
      }
      if (organizations.length < 100) break;
      cursor = organizations[organizations.length - 1].id;
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        `Platform workflow ${templateId} sweep failed`,
      );
  }
}
