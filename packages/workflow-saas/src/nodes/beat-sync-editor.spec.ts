import { BeatSyncCutStrategy, BeatSyncTransitionType } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  beatSyncEditorNodeDefinition,
  DEFAULT_BEAT_SYNC_EDITOR_DATA,
} from './beat-sync-editor';

describe('beat-sync-editor node', () => {
  describe('DEFAULT_BEAT_SYNC_EDITOR_DATA', () => {
    it('should have label set to Beat Sync Editor', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.label).toBe('Beat Sync Editor');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.status).toBe('idle');
    });

    it('should default cutStrategy to EVERY_BEAT', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.cutStrategy).toBe(
        BeatSyncCutStrategy.EVERY_BEAT,
      );
    });

    it('should default transitionType to CUT', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.transitionType).toBe(
        BeatSyncTransitionType.CUT,
      );
    });

    it('should default transitionDuration to 50', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.transitionDuration).toBe(50);
    });

    it('should default loopVideos to true and shuffleOrder to false', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.loopVideos).toBe(true);
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.shuffleOrder).toBe(false);
    });

    it('should default beatsPerClip to 1', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.beatsPerClip).toBe(1);
    });

    it('should default input arrays to empty', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.videoFiles).toEqual([]);
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.beatTimestamps).toEqual([]);
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.customPattern).toEqual([]);
    });

    it('should default output and processing fields to null', () => {
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.outputVideoUrl).toBeNull();
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.totalClips).toBeNull();
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.totalDuration).toBeNull();
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.jobId).toBeNull();
      expect(DEFAULT_BEAT_SYNC_EDITOR_DATA.processingProgress).toBeNull();
    });
  });

  describe('beatSyncEditorNodeDefinition', () => {
    it('should have type beatSyncEditor', () => {
      expect(beatSyncEditorNodeDefinition.type).toBe('beatSyncEditor');
    });

    it('should be in processing category', () => {
      expect(beatSyncEditorNodeDefinition.category).toBe('processing');
    });

    it('should have label Beat Sync Editor', () => {
      expect(beatSyncEditorNodeDefinition.label).toBe('Beat Sync Editor');
    });

    it('should require videoFiles, beatTimestamps, and musicUrl inputs', () => {
      const inputIds = beatSyncEditorNodeDefinition.inputs.map((i) => i.id);
      expect(inputIds).toEqual(['videoFiles', 'beatTimestamps', 'musicUrl']);
      for (const input of beatSyncEditorNodeDefinition.inputs) {
        expect(input.required).toBe(true);
      }
    });

    it('should output videoUrl, totalClips, and totalDuration', () => {
      const outputIds = beatSyncEditorNodeDefinition.outputs.map((o) => o.id);
      expect(outputIds).toEqual(['videoUrl', 'totalClips', 'totalDuration']);
    });

    it('should reference default data', () => {
      expect(beatSyncEditorNodeDefinition.defaultData).toBe(
        DEFAULT_BEAT_SYNC_EDITOR_DATA,
      );
    });
  });
});
