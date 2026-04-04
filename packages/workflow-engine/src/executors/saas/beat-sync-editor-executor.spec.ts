import { BeatSyncTransitionType } from '@genfeedai/enums';
import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createBeatSyncEditorExecutor } from '@workflow-engine/executors/saas/beat-sync-editor-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('BeatSyncEditorExecutor', () => {
  describe('validate', () => {
    it('valid defaults', () => {
      expect(
        createBeatSyncEditorExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        }).valid,
      ).toBe(true);
    });
    it('invalid cutStrategy', () => {
      expect(
        createBeatSyncEditorExecutor().validate({
          config: { cutStrategy: 'random' },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        }).valid,
      ).toBe(false);
    });
    it('invalid transitionType', () => {
      expect(
        createBeatSyncEditorExecutor().validate({
          config: { transitionType: 'wipe' },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        }).valid,
      ).toBe(false);
    });
    it('invalid transitionDuration', () => {
      expect(
        createBeatSyncEditorExecutor().validate({
          config: { transitionDuration: 2000 },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        }).valid,
      ).toBe(false);
    });
    it('invalid beatsPerClip', () => {
      expect(
        createBeatSyncEditorExecutor().validate({
          config: { beatsPerClip: 20 },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        }).valid,
      ).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('base cost + beatsPerClip=1 bonus', () => {
      expect(
        createBeatSyncEditorExecutor().estimateCost({
          config: {
            beatsPerClip: 1,
            transitionType: BeatSyncTransitionType.CUT,
          },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        }),
      ).toBe(8);
    });
    it('adds transition cost', () => {
      expect(
        createBeatSyncEditorExecutor().estimateCost({
          config: {
            beatsPerClip: 2,
            transitionType: BeatSyncTransitionType.CROSSFADE,
          },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        }),
      ).toBe(7);
    });
  });

  describe('execute', () => {
    it('throws without editor', async () => {
      await expect(
        createBeatSyncEditorExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([
            ['videoFiles', ['v.mp4']],
            ['beatTimestamps', [0.5]],
            ['musicUrl', 'http://m'],
          ]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'B',
            type: 'beatSyncEditor',
          },
        }),
      ).rejects.toThrow('editor');
    });

    it('processes video', async () => {
      const editor = vi.fn().mockResolvedValue({
        jobId: 'j-1',
        outputVideoUrl: 'http://out.mp4',
        totalClips: 5,
        totalDuration: 30,
      });
      const exec = createBeatSyncEditorExecutor(editor);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([
          ['videoFiles', ['v.mp4']],
          ['beatTimestamps', [0.5, 1.0]],
          ['musicUrl', 'http://m'],
        ]),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        },
      });
      expect(result.data).toBe('http://out.mp4');
      expect(result.metadata?.totalClips).toBe(5);
    });

    it('handles single string videoFiles', async () => {
      const editor = vi.fn().mockResolvedValue({
        jobId: 'j',
        outputVideoUrl: 'o',
        totalClips: 1,
        totalDuration: 10,
      });
      const exec = createBeatSyncEditorExecutor(editor);
      await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([
          ['videoFiles', 'v.mp4'],
          ['beatTimestamps', [0.5]],
          ['musicUrl', 'http://m'],
        ]),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        },
      });
      expect(editor).toHaveBeenCalledWith(
        expect.objectContaining({ videoFiles: ['v.mp4'] }),
      );
    });

    it('handles beat data as object', async () => {
      const editor = vi.fn().mockResolvedValue({
        jobId: 'j',
        outputVideoUrl: 'o',
        totalClips: 1,
        totalDuration: 10,
      });
      const exec = createBeatSyncEditorExecutor(editor);
      await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([
          ['videoFiles', ['v.mp4']],
          ['beatTimestamps', { beatTimestamps: [0.5] }],
          ['musicUrl', 'http://m'],
        ]),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'B',
          type: 'beatSyncEditor',
        },
      });
      expect(editor).toHaveBeenCalledWith(
        expect.objectContaining({ beatTimestamps: [0.5] }),
      );
    });

    it('throws on missing videoFiles', async () => {
      const editor = vi.fn();
      const exec = createBeatSyncEditorExecutor(editor);
      await expect(
        exec.execute({
          context: ctx,
          inputs: new Map<string, unknown>([
            ['beatTimestamps', [0.5]],
            ['musicUrl', 'http://m'],
          ]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'B',
            type: 'beatSyncEditor',
          },
        }),
      ).rejects.toThrow('videoFiles');
    });

    it('throws on empty beatTimestamps', async () => {
      const editor = vi.fn();
      const exec = createBeatSyncEditorExecutor(editor);
      await expect(
        exec.execute({
          context: ctx,
          inputs: new Map<string, unknown>([
            ['videoFiles', ['v.mp4']],
            ['beatTimestamps', []],
            ['musicUrl', 'http://m'],
          ]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'B',
            type: 'beatSyncEditor',
          },
        }),
      ).rejects.toThrow('beat timestamp');
    });
  });
});
