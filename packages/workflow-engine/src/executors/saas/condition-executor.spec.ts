import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  type ConditionExecutor,
  createConditionExecutor,
  evaluateCondition,
} from '@workflow-engine/executors/saas/condition-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  inputData?: unknown,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'cond-1',
    inputs: [],
    label: 'Condition',
    type: 'condition',
  };
  const inputs = new Map<string, unknown>();
  if (inputData !== undefined) {
    inputs.set('value', inputData);
  }
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('evaluateCondition', () => {
  it('equals', () => {
    expect(evaluateCondition('equals', 'foo', 'foo')).toBe(true);
    expect(evaluateCondition('equals', 'foo', 'bar')).toBe(false);
    expect(evaluateCondition('equals', 5, '5')).toBe(false); // strict equality after security fix
  });

  it('notEquals', () => {
    expect(evaluateCondition('notEquals', 'foo', 'bar')).toBe(true);
    expect(evaluateCondition('notEquals', 'foo', 'foo')).toBe(false);
  });

  it('greaterThan', () => {
    expect(evaluateCondition('greaterThan', 10, 5)).toBe(true);
    expect(evaluateCondition('greaterThan', 5, 10)).toBe(false);
  });

  it('lessThan', () => {
    expect(evaluateCondition('lessThan', 5, 10)).toBe(true);
    expect(evaluateCondition('lessThan', 10, 5)).toBe(false);
  });

  it('greaterThanOrEquals', () => {
    expect(evaluateCondition('greaterThanOrEquals', 10, 10)).toBe(true);
    expect(evaluateCondition('greaterThanOrEquals', 11, 10)).toBe(true);
    expect(evaluateCondition('greaterThanOrEquals', 9, 10)).toBe(false);
  });

  it('lessThanOrEquals', () => {
    expect(evaluateCondition('lessThanOrEquals', 10, 10)).toBe(true);
    expect(evaluateCondition('lessThanOrEquals', 9, 10)).toBe(true);
  });

  it('contains', () => {
    expect(evaluateCondition('contains', 'hello world', 'world')).toBe(true);
    expect(evaluateCondition('contains', 'hello', 'world')).toBe(false);
  });

  it('notContains', () => {
    expect(evaluateCondition('notContains', 'hello', 'world')).toBe(true);
  });

  it('startsWith', () => {
    expect(evaluateCondition('startsWith', 'hello world', 'hello')).toBe(true);
    expect(evaluateCondition('startsWith', 'hello world', 'world')).toBe(false);
  });

  it('endsWith', () => {
    expect(evaluateCondition('endsWith', 'hello world', 'world')).toBe(true);
  });

  it('matches regex', () => {
    expect(evaluateCondition('matches', 'hello123', '\\d+')).toBe(true);
    expect(evaluateCondition('matches', 'hello', '\\d+')).toBe(false);
  });

  it('isTrue / isFalse', () => {
    expect(evaluateCondition('isTrue', true, undefined)).toBe(true);
    expect(evaluateCondition('isTrue', 1, undefined)).toBe(true);
    expect(evaluateCondition('isFalse', false, undefined)).toBe(true);
    expect(evaluateCondition('isFalse', 0, undefined)).toBe(true);
  });

  it('isEmpty / isNotEmpty', () => {
    expect(evaluateCondition('isEmpty', null, undefined)).toBe(true);
    expect(evaluateCondition('isEmpty', '', undefined)).toBe(true);
    expect(evaluateCondition('isEmpty', [], undefined)).toBe(true);
    expect(evaluateCondition('isNotEmpty', 'foo', undefined)).toBe(true);
    expect(evaluateCondition('isNotEmpty', [1], undefined)).toBe(true);
  });

  it('expression', () => {
    expect(evaluateCondition('expression', 15, undefined, 'value > 10')).toBe(
      true,
    );
    expect(evaluateCondition('expression', 5, undefined, 'value > 10')).toBe(
      false,
    );
  });

  it('expression throws on missing string', () => {
    expect(() => evaluateCondition('expression', 5, undefined)).toThrow();
  });
});

describe('ConditionExecutor', () => {
  let executor: ConditionExecutor;

  beforeEach(() => {
    executor = createConditionExecutor();
  });

  it('evaluates engagementRate greaterThan', async () => {
    const input = makeInput(
      { field: 'engagementRate', operator: 'greaterThan', value: 5 },
      { engagementRate: 8.5 },
    );
    const result = await executor.execute(input);
    expect(result.metadata?.result).toBe(true);
    expect(result.metadata?.branch).toBe('true');
  });

  it('evaluates engagementRate lessThan (false branch)', async () => {
    const input = makeInput(
      { field: 'engagementRate', operator: 'greaterThan', value: 10 },
      { engagementRate: 3.2 },
    );
    const result = await executor.execute(input);
    expect(result.metadata?.result).toBe(false);
    expect(result.metadata?.branch).toBe('false');
  });

  it('evaluates custom field with dot notation', async () => {
    const input = makeInput(
      {
        customField: 'data.status',
        field: 'custom',
        operator: 'equals',
        value: 'published',
      },
      { data: { status: 'published' } },
    );
    const result = await executor.execute(input);
    expect(result.metadata?.result).toBe(true);
  });

  it('evaluates platform field', async () => {
    const input = makeInput(
      { field: 'platform', operator: 'equals', value: 'instagram' },
      { platform: 'instagram' },
    );
    const result = await executor.execute(input);
    expect(result.metadata?.result).toBe(true);
  });

  it('passes through input data', async () => {
    const inputData = { foo: 'bar' };
    const input = makeInput(
      { customField: 'foo', field: 'custom', operator: 'equals', value: 'bar' },
      inputData,
    );
    const result = await executor.execute(input);
    expect((result.data as any).data).toEqual(inputData);
  });

  describe('validate', () => {
    it('valid config', () => {
      const node: ExecutableNode = {
        config: { field: 'engagementRate', operator: 'greaterThan', value: 5 },
        id: '1',
        inputs: [],
        label: 'Condition',
        type: 'condition',
      };
      expect(executor.validate(node).valid).toBe(true);
    });

    it('missing field', () => {
      const node: ExecutableNode = {
        config: { operator: 'equals', value: 'x' },
        id: '1',
        inputs: [],
        label: 'Condition',
        type: 'condition',
      };
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Condition field is required');
    });

    it('missing value for comparison operator', () => {
      const node: ExecutableNode = {
        config: { field: 'engagementRate', operator: 'greaterThan' },
        id: '1',
        inputs: [],
        label: 'Condition',
        type: 'condition',
      };
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
    });

    it('missing customField for custom field type', () => {
      const node: ExecutableNode = {
        config: { field: 'custom', operator: 'equals', value: 'x' },
        id: '1',
        inputs: [],
        label: 'Condition',
        type: 'condition',
      };
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'customField is required when field is "custom"',
      );
    });
  });
});
