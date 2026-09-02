import {
  type ActionExecutor,
  GENFEED_ACTION_NODE_TYPE,
} from '@genfeedai/actions';
import type { ExecutableNode } from '../../types';
import { deriveWorkflowActionIdempotencyKey } from '../../utils/idempotency';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export class GenfeedActionExecutor extends BaseExecutor {
  readonly nodeType = GENFEED_ACTION_NODE_TYPE;
  private executor: ActionExecutor | null = null;

  setExecutor(executor: ActionExecutor): void {
    this.executor = executor;
  }

  override validate(node: ExecutableNode): {
    errors: string[];
    valid: boolean;
  } {
    const base = super.validate(node);
    const errors = [...base.errors];
    const actionId = node.config.actionId;

    if (typeof actionId !== 'string' || actionId.length === 0) {
      errors.push('A registered Genfeed actionId is required');
    }

    return { errors, valid: errors.length === 0 };
  }

  async execute({
    context,
    inputs,
    node,
  }: ExecutorInput): Promise<ExecutorOutput> {
    if (!this.executor) {
      throw new Error('Genfeed action executor is not configured');
    }

    const actionId = node.config.actionId;
    if (typeof actionId !== 'string' || actionId.length === 0) {
      throw new Error('A registered Genfeed actionId is required');
    }

    const { actionId: _actionId, parameters, ...runtimeConfig } = node.config;
    const idempotencyKey = deriveWorkflowActionIdempotencyKey({
      actionId,
      executionId: context.executionId,
      nodeId: node.id,
    });
    const input = {
      ...(typeof parameters === 'object' &&
      parameters !== null &&
      !Array.isArray(parameters)
        ? (parameters as Record<string, unknown>)
        : {}),
      ...runtimeConfig,
      ...Object.fromEntries(inputs),
    };
    const result = await this.executor({
      context: {
        actionId,
        brandId:
          typeof node.config.brandId === 'string'
            ? node.config.brandId
            : undefined,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        nodeId: node.id,
        organizationId: context.organizationId,
        origin: 'workflow',
        runId: context.runId,
        userId: context.userId,
        workflowId: context.workflowId,
        workflowVersionId: context.workflowVersionId,
      },
      input,
    });

    return { data: result.data, metadata: result.metadata };
  }
}

export function createGenfeedActionExecutor(
  executor?: ActionExecutor,
): GenfeedActionExecutor {
  const nodeExecutor = new GenfeedActionExecutor();
  if (executor) {
    nodeExecutor.setExecutor(executor);
  }
  return nodeExecutor;
}
