import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutableNode } from '@workflow-engine/types';

export interface ExecutorInput {
  node: ExecutableNode;
  inputs: Map<string, unknown>;
  context: ExecutionContext;
}

export interface ExecutorOutput {
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface INodeExecutor {
  readonly nodeType: string;
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
  validate?(node: ExecutableNode): { valid: boolean; errors: string[] };
  estimateCost?(node: ExecutableNode): number;
}

export abstract class BaseExecutor implements INodeExecutor {
  abstract readonly nodeType: string;

  abstract execute(input: ExecutorInput): Promise<ExecutorOutput>;

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (node.type !== this.nodeType) {
      errors.push(`Expected node type ${this.nodeType}, got ${node.type}`);
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }

  protected getRequiredInput<T>(inputs: Map<string, unknown>, key: string): T {
    const value = inputs.get(key);
    if (value === undefined) {
      throw new Error(`Missing required input: ${key}`);
    }
    return value as T;
  }

  protected getOptionalInput<T>(
    inputs: Map<string, unknown>,
    key: string,
    defaultValue: T,
  ): T {
    const value = inputs.get(key);
    return (value as T) ?? defaultValue;
  }

  protected getRequiredConfig<T>(
    config: Record<string, unknown>,
    key: string,
  ): T {
    const value = config[key];
    if (value === undefined) {
      throw new Error(`Missing required config: ${key}`);
    }
    return value as T;
  }

  protected getOptionalConfig<T>(
    config: Record<string, unknown>,
    key: string,
    defaultValue: T,
  ): T {
    const value = config[key];
    return (value as T) ?? defaultValue;
  }

  /**
   * Resolve a string value from node config, falling back to a connected input.
   * Returns undefined when neither source has a non-empty string.
   */
  protected getConfigOrInputString(
    node: ExecutableNode,
    inputs: Map<string, unknown>,
    key: string,
  ): string | undefined {
    const configValue = node.config[key];
    if (typeof configValue === 'string' && configValue.trim().length > 0) {
      return configValue;
    }

    const inputValue = inputs.get(key);
    return typeof inputValue === 'string' && inputValue.trim().length > 0
      ? inputValue
      : undefined;
  }
}

export class NoopExecutor extends BaseExecutor {
  readonly nodeType = 'noop';

  execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const firstInput = input.inputs.values().next().value;
    return Promise.resolve({
      data: firstInput ?? null,
      metadata: {
        passthrough: true,
      },
    });
  }
}

export function createSimpleExecutor(
  nodeType: string,
  executeFn: (input: ExecutorInput) => Promise<unknown>,
): INodeExecutor {
  return {
    async execute(input: ExecutorInput): Promise<ExecutorOutput> {
      const data = await executeFn(input);
      return { data };
    },
    nodeType,
  };
}
