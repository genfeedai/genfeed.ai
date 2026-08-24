import { beforeEach, describe, expect, it } from 'vitest';
import type { PromptConstructorJsonPayload } from '../../../contracts/prompt-constructor';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import { PromptConstructorExecutor } from './prompt-constructor-executor';
import {
  readPromptConstructorPrompt,
  serializeStructuredPrompt,
} from './prompt-json';

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
    executor = new PromptConstructorExecutor();
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

    it('should fold hooks and avoid lists into the resolved prompt', async () => {
      const input = makeInput(
        {
          maxLength: 2200,
          template: 'Write a {{tone}} caption about {{topic}}.',
          tone: 'brand-voice',
        },
        [
          ['topic', 'ai tools'],
          ['hooks', ['I tried X for a week', 'Stop doing Y']],
          ['avoid', ['giveaway', 'unboxings']],
        ],
      );

      const result = await executor.execute(input);

      expect(result.data).toBe(
        [
          'Write a brand-voice caption about ai tools.',
          'Proven hooks to emulate:\n- I tried X for a week\n- Stop doing Y',
          'Avoid these topics:\n- giveaway\n- unboxings',
        ].join('\n\n'),
      );
      expect(result.metadata).toMatchObject({
        avoidCount: 2,
        hooksCount: 2,
      });
    });

    it('should skip empty hooks and avoid guidance', async () => {
      const input = makeInput(
        {
          template: 'Write about {{topic}}',
        },
        [
          ['topic', 'ai tools'],
          ['hooks', []],
          ['avoid', '  '],
        ],
      );

      const result = await executor.execute(input);

      expect(result.data).toBe('Write about ai tools');
      expect(result.metadata).toMatchObject({
        avoidCount: 0,
        hooksCount: 0,
      });
    });
  });

  describe('json mode', () => {
    const structuredPrompt = {
      camera: { move: 'dolly' },
      scene: 'night alley',
      tags: ['wide', 'wet'],
    };

    it('emits a structured payload losslessly for valid JSON', async () => {
      const input = makeInput({
        promptFormat: 'json',
        template: JSON.stringify(structuredPrompt),
      });

      const result = await executor.execute(input);
      const data = result.data as PromptConstructorJsonPayload;

      expect(data.promptFormat).toBe('json');
      expect(data.structuredPrompt).toEqual(structuredPrompt);
      expect(data.prompt).toBe(serializeStructuredPrompt(structuredPrompt));
      expect(result.metadata).toMatchObject({
        isStructuredPromptValid: true,
        promptFormat: 'json',
      });
    });

    it('re-emits a stored structuredPrompt object without re-serialization drift', async () => {
      const stored = { b: 1, a: { z: true, m: [2, 1] } };
      const input = makeInput({
        promptFormat: 'json',
        structuredPrompt: stored,
        template: '{"b":1,"a":{"z":true,"m":[2,1]}}',
      });

      const result = await executor.execute(input);
      const data = result.data as PromptConstructorJsonPayload;

      expect(data.structuredPrompt).toBe(stored);
      expect(data.prompt).toBe(serializeStructuredPrompt(stored));
    });

    it('substitutes template variables before parsing JSON', async () => {
      const input = makeInput({
        promptFormat: 'json',
        template: '{"subject":"{{subject}}","style":"{{style}}"}',
        variables: { style: 'cinematic', subject: 'a cat' },
      });

      const result = await executor.execute(input);
      const data = result.data as PromptConstructorJsonPayload;

      expect(data.structuredPrompt).toEqual({
        style: 'cinematic',
        subject: 'a cat',
      });
      expect(data.prompt).toBe(
        serializeStructuredPrompt({
          style: 'cinematic',
          subject: 'a cat',
        }),
      );
    });

    it('serializes to deterministic text when structured output is not accepted', async () => {
      const input = makeInput({
        acceptsStructuredPrompt: false,
        promptFormat: 'json',
        template: JSON.stringify(structuredPrompt),
      });

      const result = await executor.execute(input);
      const expected = serializeStructuredPrompt(structuredPrompt);

      expect(result.data).toBe(expected);
      expect(readPromptConstructorPrompt(result.data)).toBe(expected);
      expect(result.metadata).toMatchObject({
        isStructuredPromptSerialized: true,
        isStructuredPromptValid: true,
        promptFormat: 'json',
      });
    });

    it('keeps invalid JSON as draft text without failing execution', async () => {
      const draft = '{"scene":';
      const input = makeInput({
        promptFormat: 'json',
        template: draft,
      });

      const result = await executor.execute(input);
      const data = result.data as PromptConstructorJsonPayload;

      expect(data.promptFormat).toBe('json');
      expect(data.prompt).toBe(draft);
      expect(data.structuredPrompt).toBeUndefined();
      expect(result.metadata).toMatchObject({
        isStructuredPromptValid: false,
        promptFormat: 'json',
      });
    });

    it('folds hooks and avoid into the string prompt without mutating structured JSON', async () => {
      const input = makeInput(
        {
          promptFormat: 'json',
          template: '{"scene":"studio"}',
        },
        [
          ['hooks', ['I tried X for a week']],
          ['avoid', ['giveaway']],
        ],
      );

      const result = await executor.execute(input);
      const data = result.data as PromptConstructorJsonPayload;

      expect(data.structuredPrompt).toEqual({ scene: 'studio' });
      expect(data.prompt).toBe(
        [
          serializeStructuredPrompt({ scene: 'studio' }),
          'Proven hooks to emulate:\n- I tried X for a week',
          'Avoid these topics:\n- giveaway',
        ].join('\n\n'),
      );
    });

    it('still exposes a string prompt for text-only consumers', async () => {
      const input = makeInput({
        promptFormat: 'json',
        template: '{"scene":"night"}',
      });

      const result = await executor.execute(input);

      expect(readPromptConstructorPrompt(result.data)).toBe(
        serializeStructuredPrompt({ scene: 'night' }),
      );
    });
  });
});
