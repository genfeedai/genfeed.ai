import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createTextToSpeechExecutor,
  TextToSpeechExecutor,
  type TtsResolver,
} from '@workflow-engine/executors/saas/text-to-speech-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: { voiceId: 'voice-abc', ...configOverrides },
    id: 'tts-1',
    inputs: [],
    label: 'Text to Speech',
    type: 'textToSpeech',
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

describe('TextToSpeechExecutor', () => {
  let executor: TextToSpeechExecutor;
  let mockResolver: TtsResolver;

  beforeEach(() => {
    executor = createTextToSpeechExecutor();
    mockResolver = vi.fn().mockResolvedValue({
      audioUrl: 'https://cdn.example.com/speech.mp3',
      duration: 5.2,
    });
    executor.setResolver(mockResolver);
  });

  describe('validate', () => {
    it('should pass with valid voiceId', () => {
      const node = makeNode({ voiceId: 'voice-abc' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when voiceId is missing', () => {
      const node = makeNode({});
      delete node.config.voiceId;
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Voice ID is required for text to speech',
      );
    });

    it('should fail when voiceId is not a string', () => {
      const node = makeNode({ voiceId: 42 });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Voice ID is required for text to speech',
      );
    });

    it('should fail when node type does not match', () => {
      const node = makeNode();
      node.type = 'wrongType';
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('should return 3 credits', () => {
      expect(executor.estimateCost(makeNode())).toBe(3);
    });
  });

  describe('execute', () => {
    it('should throw when resolver is not configured', async () => {
      const noResolverExecutor = createTextToSpeechExecutor();
      const input = makeInput({}, [['text', 'Hello world']]);

      await expect(noResolverExecutor.execute(input)).rejects.toThrow(
        'TextToSpeech resolver not configured',
      );
    });

    it('should throw when no text is provided from input or config', async () => {
      const input = makeInput({}, []);
      delete input.node.config.text;

      await expect(executor.execute(input)).rejects.toThrow(
        'Text is required: provide via input port or node config',
      );
    });

    it('should use text from input port', async () => {
      const input = makeInput({}, [['text', 'Hello from input']]);

      const result = await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'Hello from input',
        'voice-abc',
        input.context,
        input.node,
      );
      expect(result.data).toEqual({
        audioUrl: 'https://cdn.example.com/speech.mp3',
        duration: 5.2,
      });
    });

    it('should fall back to text from config when input port is absent', async () => {
      const input = makeInput({ text: 'Hello from config' }, []);

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'Hello from config',
        'voice-abc',
        input.context,
        input.node,
      );
    });

    it('should prefer text from input port over config', async () => {
      const input = makeInput({ text: 'config text' }, [
        ['text', 'input text'],
      ]);

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'input text',
        'voice-abc',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should return metadata with duration and voiceId', async () => {
      const input = makeInput({}, [['text', 'Test speech']]);

      const result = await executor.execute(input);

      expect(result.metadata?.duration).toBe(5.2);
      expect(result.metadata?.voiceId).toBe('voice-abc');
    });
  });
});
