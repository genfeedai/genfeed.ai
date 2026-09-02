import {
  BATCH_WORKFLOW_EXECUTION_ID,
  buildBatchWorkflowExecutionDefinition,
} from '@api/collections/workflows/services/batch-workflow-execution.definition';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

const MAX_BATCH_ITEMS = 100;

export type StartBatchWorkflowExecutionInput = {
  ingredientIds: string[];
  organizationId: string;
  userId: string;
  workflowId: string;
};

@Injectable()
export class BatchWorkflowExecutionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerWorkflow(
      buildBatchWorkflowExecutionDefinition(),
    );
  }

  async startBatchExecution(
    input: StartBatchWorkflowExecutionInput,
  ): Promise<string> {
    const ingredientIds = this.validateIngredientIds(input.ingredientIds);
    const workflow = await this.workflowsService.findOwnedOrThrow(
      input.workflowId,
      { organizationId: input.organizationId },
    );
    if (!workflow.versionId) {
      throw new BadRequestException(
        'Workflow must have an immutable version before batch execution',
      );
    }

    await this.assertIngredientsOwned(ingredientIds, input.organizationId);

    const { executionId } = await this.workflowRunner.enqueueWorkflow({
      actionType: BATCH_WORKFLOW_EXECUTION_ID,
      canonicalId: BATCH_WORKFLOW_EXECUTION_ID,
      inputValues: {
        childWorkflowId: workflow.id,
        childWorkflowVersionId: workflow.versionId,
        items: ingredientIds,
      },
      metadata: {
        batchExecution: {
          childWorkflowId: workflow.id,
          childWorkflowVersionId: workflow.versionId,
          itemCount: ingredientIds.length,
        },
      },
      organizationId: input.organizationId,
      source: 'WorkflowBatchController.startBatchExecution',
      userId: input.userId,
    });

    return executionId;
  }

  private validateIngredientIds(ingredientIds: string[]): string[] {
    if (!Array.isArray(ingredientIds) || ingredientIds.length === 0) {
      throw new BadRequestException('At least one ingredientId is required');
    }
    if (ingredientIds.length > MAX_BATCH_ITEMS) {
      throw new BadRequestException(
        `A workflow batch accepts at most ${MAX_BATCH_ITEMS} ingredients`,
      );
    }

    const normalized = ingredientIds.map((ingredientId) =>
      typeof ingredientId === 'string' ? ingredientId.trim() : '',
    );
    if (normalized.some((ingredientId) => ingredientId.length === 0)) {
      throw new BadRequestException('Every ingredientId must be a string');
    }
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Duplicate ingredientIds are not allowed');
    }
    return normalized;
  }

  private async assertIngredientsOwned(
    ingredientIds: string[],
    organizationId: string,
  ): Promise<void> {
    const ownedCount = await this.prisma.ingredient.count({
      where: scopedWhere(organizationId, { id: { in: ingredientIds } }),
    });
    if (ownedCount !== ingredientIds.length) {
      throw new BadRequestException(
        'One or more ingredient IDs are invalid or do not belong to your organization',
      );
    }
  }
}
