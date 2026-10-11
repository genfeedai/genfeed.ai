import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BreakoutResponseExecutionService } from '@api/collections/outliers/services/breakout-response-execution.service';
import {
  admitBreakoutResponseExecution,
  reauthorizeBreakoutActor,
} from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import {
  BREAKOUT_RESPONSE_ACTION_ID,
  buildBreakoutResponseExecutionWorkflowDefinition,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export type BreakoutResponseExecutionOutput = {
  outputIds: string[];
  reason: string | null;
  responseId: string;
  status: 'completed' | 'held' | 'processing';
};

/**
 * Registers the system-only `breakout.response.execute` action. Authority comes from the
 * persisted pinned execution (see the admission util); it is re-read live before every step
 * through the `reauthorize` the execution service already calls.
 */
@Injectable()
export class BreakoutResponseExecutionWorkflowService implements OnModuleInit {
  constructor(
    private readonly execution: BreakoutResponseExecutionService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(BREAKOUT_RESPONSE_ACTION_ID, (action) =>
      this.run(action),
    );
    this.runner.registerWorkflow(
      buildBreakoutResponseExecutionWorkflowDefinition(),
    );
  }

  private async run(
    action: SystemWorkflowActionRequest,
  ): Promise<BreakoutResponseExecutionOutput> {
    const admission = await admitBreakoutResponseExecution(
      this.prisma,
      this.brandAccess,
      action,
      action.input.request,
    );
    const { scope } = admission;
    const result = await this.execution.execute({
      scope: {
        brandId: scope.brandId,
        credentialId: scope.credentialId,
        organizationId: scope.organizationId,
        platform: scope.platform,
      },
      responseId: scope.responseId,
      strategyId: scope.strategyId,
      actorUserId: admission.initiatingActor.userId,
      workflowExecutionId: admission.workflowExecutionId,
      reauthorize: async (tx) => {
        await reauthorizeBreakoutActor(tx, this.brandAccess, admission);
      },
    });
    return {
      outputIds: result.outputs.map((output) => output.outputId),
      reason: result.reason,
      responseId: result.responseId,
      status: result.status,
    };
  }
}
