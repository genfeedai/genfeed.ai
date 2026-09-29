import { describe, expect, it } from 'vitest';
import type { ExecutableNode } from '../types';
import {
  BaseExecutor,
  createSimpleExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from './base-executor';

class TestExecutor extends BaseExecutor {
  readonly nodeType = 'test';

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    return { data: input.inputs.get('key') ?? null };
  }

  optionalConfig<T>(
    config: Record<string, unknown>,
    key: string,
    defaultValue: T,
  ): T {
    return this.getOptionalConfig(config, key, defaultValue);
  }

  optionalInput<T>(
    inputs: Map<string, unknown>,
    key: string,
    defaultValue: T,
  ): T {
    return this.getOptionalInput(inputs, key, defaultValue);
  }

  requiredConfig<T>(config: Record<string, unknown>, key: string): T {
    return this.getRequiredConfig(config, key);
  }

  requiredInput<T>(inputs: Map<string, unknown>, key: string): T {
    return this.getRequiredInput(inputs, key);
  }
}

function makeNode(type: string): ExecutableNode {
  return { config: {}, id: '1', inputs: [], label: 'Test', type };
}

describe('BaseExecutor', () => {
  it('rejects wrong node type', () => {
    const exec = new TestExecutor();
    const result = exec.validate(makeNode('wrong'));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Expected node type test');
  });

  it('estimateCost returns 0 by default', () => {
    const exec = new TestExecutor();
    expect(exec.estimateCost(makeNode('test'))).toBe(0);
  });

  it('getRequiredConfig throws on missing key', () => {
    const exec = new TestExecutor();
    expect(() => exec.requiredConfig({}, 'missing')).toThrow(
      'Missing required config',
    );
  });
});

describe('createSimpleExecutor', () => {
  it('wraps function into executor', async () => {
    const exec = createSimpleExecutor('simple', async () => 'result');
    expect(exec.nodeType).toBe('simple');
    const result = await exec.execute({
      context: {
        organizationId: 'o',
        runId: 'r',
        userId: 'u',
        workflowId: 'w',
        workflowVersionId: 'wv',
      },
      inputs: new Map(),
      node: makeNode('simple'),
    });
    expect(result.data).toBe('result');
  });
});
