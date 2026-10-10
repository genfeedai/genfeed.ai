import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { currentWorkflowGenerationDispatch } from '@api/collections/workflow-executions/services/workflow-generation-dispatch.context';
import {
  type ValidatedWorkflowMediaDispatch,
  WorkflowMediaBillingPlanService,
} from '@api/collections/workflows/services/workflow-media-billing-plan.service';
import { assertWorkflowGenerationActorAdmission } from '@api/collections/workflows/utils/workflow-generation-actor-admission.util';
import { parseWorkflowGenerationAdmissionSource } from '@api/collections/workflows/utils/workflow-generation-admission-source.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { workflowExecutionGenerationBillingSchema } from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ExecutableNode,
  ExecutionContext,
} from '@genfeedai/workflows/engine';
import { Injectable, Optional } from '@nestjs/common';

/** Authorizes the stored actor and frozen funding before any media provider dispatch. */
@Injectable()
export class WorkflowMediaDispatchAdmissionService {
  constructor(
    @Optional() private readonly billing?: WorkflowMediaBillingPlanService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly brandAccess?: BrandAccessService,
  ) {}
  async authorize(
    node: ExecutableNode,
    context: ExecutionContext,
  ): Promise<ValidatedWorkflowMediaDispatch | undefined> {
    if (!context.executionId || !this.billing || !this.prisma) {
      return undefined;
    }
    const execution = await this.prisma.workflowExecution.findFirst({
      select: {
        generationAdmissionSource: true,
        generationBilling: true,
      },
      where: {
        id: context.executionId,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });
    if (!execution) {
      throw new BusinessLogicException('Workflow execution is unavailable');
    }
    if (!execution.generationAdmissionSource && !execution.generationBilling) {
      return undefined;
    }
    if (!execution.generationBilling) {
      throw new BusinessLogicException(
        'Workflow funded dispatch is unavailable',
      );
    }
    if (execution.generationAdmissionSource) {
      const source = parseWorkflowGenerationAdmissionSource(
        execution.generationAdmissionSource,
      );
      if (
        !this.brandAccess ||
        source.state !== 'available' ||
        source.organizationId !== context.organizationId ||
        source.actorUserId !== context.userId ||
        source.workflowVersionId !== context.workflowVersionId
      )
        throw new BusinessLogicException(
          'Workflow generation actor admission is unavailable',
        );
      await assertWorkflowGenerationActorAdmission(
        this.brandAccess,
        source,
        this.prisma,
        node.id,
      );
    }
    const dispatch = currentWorkflowGenerationDispatch();
    if (
      !dispatch ||
      dispatch.executionId !== context.executionId ||
      dispatch.organizationId !== context.organizationId
    ) {
      throw new BusinessLogicException(
        'Workflow dispatch context is unavailable',
      );
    }
    return this.billing.validateDispatch({
      context: { ...context, executionId: context.executionId },
      executionId: context.executionId,
      funding: workflowExecutionGenerationBillingSchema.parse(
        execution.generationBilling,
      ),
      inputs: dispatch.inputs,
      node,
      operationId: dispatch.operationId,
    });
  }
}
