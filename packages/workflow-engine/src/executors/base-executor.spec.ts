import {
  BaseExecutor,
  createSimpleExecutor,
  type ExecutorInput,
  type ExecutorOutput,
  NoopExecutor,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { describe, expect, it } from 'vitest';

class TestExecutor extends BaseExecutor {
  readonly nodeType = 'test';

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    return { data: input.inputs.get('key') ?? null };
  }
}

function makeNode(type: string): ExecutableNode {
  return { config: {}, id: '1', inputs: [], label: 'Test', type };
}

describe('BaseExecutor', () => {
  it('validates correct node type', () => {
    const exec = new TestExecutor();
    expect(exec.validate(makeNode('test')).valid).toBe(true);
  });

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

  it('getRequiredInput throws on missing key', () => {
    const exec = new TestExecutor();
    const inputs = new Map<string, unknown>();
    expect(() => (exec as any).getRequiredInput(inputs, 'missing')).toThrow(
      'Missing required input',
    );
  });

  it('getOptionalInput returns default on missing key', () => {
    const exec = new TestExecutor();
    const inputs = new Map<string, unknown>();
    expect((exec as any).getOptionalInput(inputs, 'missing', 'default')).toBe(
      'default',
    );
  });

  it('getRequiredConfig throws on missing key', () => {
    const exec = new TestExecutor();
    expect(() => (exec as any).getRequiredConfig({}, 'missing')).toThrow(
      'Missing required config',
    );
  });

  it('getOptionalConfig returns default on missing key', () => {
    const exec = new TestExecutor();
    expect((exec as any).getOptionalConfig({}, 'missing', 42)).toBe(42);
  });
});

describe('NoopExecutor', () => {
  it('passes through first input', async () => {
    const exec = new NoopExecutor();
    const inputs = new Map<string, unknown>([['a', 'value']]);
    const result = await exec.execute({
      context: {
        organizationId: 'o',
        runId: 'r',
        userId: 'u',
        workflowId: 'w',
      },
      inputs,
      node: makeNode('noop'),
    });
    expect(result.data).toBe('value');
    expect(result.metadata?.passthrough).toBe(true);
  });

  it('returns null when no inputs', async () => {
    const exec = new NoopExecutor();
    const result = await exec.execute({
      context: {
        organizationId: 'o',
        runId: 'r',
        userId: 'u',
        workflowId: 'w',
      },
      inputs: new Map(),
      node: makeNode('noop'),
    });
    expect(result.data).toBeNull();
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
      },
      inputs: new Map(),
      node: makeNode('simple'),
    });
    expect(result.data).toBe('result');
  });
});
