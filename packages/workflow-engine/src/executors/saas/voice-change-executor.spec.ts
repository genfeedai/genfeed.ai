import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createVoiceChangeExecutor,
  type VoiceChangeExecutor,
  type VoiceChangeResolver,
} from '@workflow-engine/executors/saas/voice-change-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: { targetVoiceId: 'voice-xyz', ...configOverrides },
    id: 'voice-change-1',
    inputs: [],
    label: 'Voice Change',
    type: 'voiceChange',
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

describe('VoiceChangeExecutor', () => {
  let executor: VoiceChangeExecutor;
  let mockResolver: VoiceChangeResolver;

  beforeEach(() => {
    executor = createVoiceChangeExecutor();
    mockResolver = vi.fn().mockResolvedValue({
      audioUrl: 'https://cdn.example.com/changed-voice.mp3',
    });
    executor.setResolver(mockResolver);
  });

  describe('validate', () => {
    it('should pass with valid targetVoiceId', () => {
      const node = makeNode({ targetVoiceId: 'voice-xyz' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when targetVoiceId is missing', () => {
      const node = makeNode({});
      delete node.config.targetVoiceId;
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Target voice ID is required for voice change',
      );
    });

    it('should fail when targetVoiceId is not a string', () => {
      const node = makeNode({ targetVoiceId: 123 });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Target voice ID is required for voice change',
      );
    });

    it('should pass with valid pitchShift', () => {
      const node = makeNode({ pitchShift: 5, targetVoiceId: 'voice-xyz' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
    });

    it('should pass with pitchShift at boundaries', () => {
      const nodeLow = makeNode({ pitchShift: -12, targetVoiceId: 'voice-xyz' });
      expect(executor.validate(nodeLow).valid).toBe(true);

      const nodeHigh = makeNode({ pitchShift: 12, targetVoiceId: 'voice-xyz' });
      expect(executor.validate(nodeHigh).valid).toBe(true);
    });

    it('should fail when pitchShift is out of range (too low)', () => {
      const node = makeNode({ pitchShift: -13, targetVoiceId: 'voice-xyz' });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Pitch shift must be a number between -12 and 12',
      );
    });

    it('should fail when pitchShift is out of range (too high)', () => {
      const node = makeNode({ pitchShift: 13, targetVoiceId: 'voice-xyz' });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Pitch shift must be a number between -12 and 12',
      );
    });

    it('should fail when pitchShift is not a number', () => {
      const node = makeNode({ pitchShift: 'high', targetVoiceId: 'voice-xyz' });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Pitch shift must be a number between -12 and 12',
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
    it('should return 5 credits', () => {
      expect(executor.estimateCost(makeNode())).toBe(5);
    });
  });

  describe('execute', () => {
    it('should throw when resolver is not configured', async () => {
      const noResolverExecutor = createVoiceChangeExecutor();
      const input = makeInput({}, [
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      await expect(noResolverExecutor.execute(input)).rejects.toThrow(
        'VoiceChange resolver not configured',
      );
    });

    it('should throw when audio input is missing', async () => {
      const input = makeInput({}, []);

      await expect(executor.execute(input)).rejects.toThrow(
        'Missing required input: audio',
      );
    });

    it('should call resolver without pitchShift when not configured', async () => {
      const input = makeInput({ targetVoiceId: 'voice-xyz' }, [
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);
      delete input.node.config.pitchShift;

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'https://cdn.example.com/audio.mp3',
        'voice-xyz',
        {},
      );
    });

    it('should call resolver with pitchShift when configured', async () => {
      const input = makeInput({ pitchShift: 3, targetVoiceId: 'voice-xyz' }, [
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'https://cdn.example.com/audio.mp3',
        'voice-xyz',
        { pitchShift: 3 },
      );
    });

    it('should return audio URL as data', async () => {
      const input = makeInput({ targetVoiceId: 'voice-xyz' }, [
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      const result = await executor.execute(input);

      expect(result.data).toBe('https://cdn.example.com/changed-voice.mp3');
    });

    it('should return metadata with targetVoiceId and pitchShift', async () => {
      const input = makeInput({ pitchShift: -2, targetVoiceId: 'voice-xyz' }, [
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      const result = await executor.execute(input);

      expect(result.metadata?.targetVoiceId).toBe('voice-xyz');
      expect(result.metadata?.pitchShift).toBe(-2);
    });

    it('should return undefined pitchShift in metadata when not configured', async () => {
      const input = makeInput({ targetVoiceId: 'voice-xyz' }, [
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);
      delete input.node.config.pitchShift;

      const result = await executor.execute(input);

      expect(result.metadata?.pitchShift).toBeUndefined();
    });
  });
});
