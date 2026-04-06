import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createPromptConstructorExecutor,
  type PromptConstructorExecutor,
} from '@workflow-engine/executors/saas/prompt-constructor-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: {
      template: 'Hello {{name}}, welcome to {{place}}!',
      variables: { name: 'Alice', place: 'Wonderland' },
      ...configOverrides,
    },
    id: 'prompt-1',
    inputs: [],
    label: 'Prompt Constructor',
    type: 'promptConstructor',
  };
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
}

function makeInput(
  configOverrides: Record<string, unknown> = {},
  inputEntries: [string, unknown][] = [],
): ExecutorInput {
  return {
    context: makeContext(),
    inputs: new Map<string, unknown>(inputEntries),
    node: makeNode(configOverrides),
  };
}

describe('PromptConstructorExecutor', () => {
  let executor: PromptConstructorExecutor;

  beforeEach(() => {
    executor = createPromptConstructorExecutor();
  });

  describe('validate', () => {
    it('should pass with valid template', () => {
      const node = makeNode({ template: 'Generate a {{style}} image' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when template is missing', () => {
      const node = makeNode({});
      delete node.config.template;
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Template is required and must be a string',
      );
    });

    it('should fail when template is not a string', () => {
      const node = makeNode({ template: 123 });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Template is required and must be a string',
      );
    });

    it('should fail when template is empty whitespace', () => {
      const node = makeNode({ template: '   ' });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template must not be empty');
    });
  });

  describe('estimateCost', () => {
    it('should return 0 credits', () => {
      expect(executor.estimateCost(makeNode())).toBe(0);
    });
  });

  describe('execute', () => {
    it('should resolve all template variables from config', async () => {
      const input = makeInput({
        template: 'Hello {{name}}, welcome to {{place}}!',
        variables: { name: 'Alice', place: 'Wonderland' },
      });

      const result = await executor.execute(input);

      expect(result.data).toBe('Hello Alice, welcome to Wonderland!');
      expect(result.metadata?.resolvedCount).toBe(2);
      expect(result.metadata?.unresolvedCount).toBe(0);
    });

    it('should leave unresolved placeholders intact', async () => {
      const input = makeInput({
        template: 'Hello {{name}}, your {{role}} awaits',
        variables: { name: 'Bob' },
      });

      const result = await executor.execute(input);

      expect(result.data).toBe('Hello Bob, your {{role}} awaits');
      expect(result.metadata?.resolvedCount).toBe(1);
      expect(result.metadata?.unresolvedCount).toBe(1);
    });

    it('should resolve variables from inputs overriding config variables', async () => {
      const input = makeInput(
        {
          template: 'Create a {{style}} portrait of {{subject}}',
          variables: { style: 'realistic', subject: 'a cat' },
        },
        [['style', 'cinematic']],
      );

      const result = await executor.execute(input);

      // Input 'style' should override config 'style'
      expect(result.data).toBe('Create a cinematic portrait of a cat');
    });

    it('should handle template with no placeholders', async () => {
      const input = makeInput({
        template: 'A static prompt with no variables',
        variables: {},
      });

      const result = await executor.execute(input);

      expect(result.data).toBe('A static prompt with no variables');
      expect(result.metadata?.resolvedCount).toBe(0);
      expect(result.metadata?.unresolvedCount).toBe(0);
    });

    it('should handle null/undefined input values gracefully', async () => {
      const input = makeInput(
        {
          template: 'Value is {{key}}',
          variables: {},
        },
        [
          ['key', null],
          ['other', undefined],
        ],
      );

      const result = await executor.execute(input);

      // null and undefined inputs should be skipped, so placeholder remains
      expect(result.data).toBe('Value is {{key}}');
    });

    it('should stringify non-string variable values', async () => {
      const input = makeInput({
        template: 'Count: {{count}}, flag: {{flag}}',
        variables: { count: 42, flag: true },
      });

      const result = await executor.execute(input);

      expect(result.data).toBe('Count: 42, flag: true');
    });

    it('should handle empty variables object', async () => {
      const input = makeInput({
        template: 'Hello {{name}}',
      });
      delete input.node.config.variables;

      const result = await executor.execute(input);

      expect(result.data).toBe('Hello {{name}}');
      expect(result.metadata?.unresolvedCount).toBe(1);
    });

    it('should handle duplicate placeholders', async () => {
      const input = makeInput({
        template: '{{name}} meets {{name}}',
        variables: { name: 'Alice' },
      });

      const result = await executor.execute(input);

      expect(result.data).toBe('Alice meets Alice');
      expect(result.metadata?.resolvedCount).toBe(2);
    });
  });
});
