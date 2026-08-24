import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_QA_DATA, videoQaNodeDefinition } from './video-qa';

describe('video-qa node', () => {
  describe('DEFAULT_VIDEO_QA_DATA', () => {
    it('should have label set to Video QA', () => {
      expect(DEFAULT_VIDEO_QA_DATA.label).toBe('Video QA');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_VIDEO_QA_DATA.status).toBe('idle');
    });

    it('should default loudness target to -16 LUFS', () => {
      expect(DEFAULT_VIDEO_QA_DATA.loudnessTargetLufs).toBe(-16);
    });

    it('should default contact sheet off', () => {
      expect(DEFAULT_VIDEO_QA_DATA.isContactSheetEnabled).toBe(false);
    });

    it('should default input video and report to null', () => {
      expect(DEFAULT_VIDEO_QA_DATA.inputVideo).toBeNull();
      expect(DEFAULT_VIDEO_QA_DATA.report).toBeNull();
      expect(DEFAULT_VIDEO_QA_DATA.jobId).toBeNull();
    });

    it('should leave expected contract fields unset', () => {
      expect(DEFAULT_VIDEO_QA_DATA.expectedDurationSeconds).toBeNull();
      expect(DEFAULT_VIDEO_QA_DATA.expectedWidth).toBeNull();
      expect(DEFAULT_VIDEO_QA_DATA.expectedHeight).toBeNull();
      expect(DEFAULT_VIDEO_QA_DATA.expectedFrameRate).toBeNull();
      expect(DEFAULT_VIDEO_QA_DATA.hasExpectedAudio).toBeNull();
    });
  });

  describe('videoQaNodeDefinition', () => {
    it('should have type videoQa', () => {
      expect(videoQaNodeDefinition.type).toBe('videoQa');
    });

    it('should be in processing category', () => {
      expect(videoQaNodeDefinition.category).toBe('processing');
    });

    it('should have label Video QA', () => {
      expect(videoQaNodeDefinition.label).toBe('Video QA');
    });

    it('should require a video input', () => {
      expect(videoQaNodeDefinition.inputs).toHaveLength(1);
      const videoInput = videoQaNodeDefinition.inputs.find(
        (entry) => entry.id === 'video',
      );
      expect(videoInput?.required).toBe(true);
      expect(videoInput?.type).toBe('video');
    });

    it('should expose passed, report, and fail-closed video outputs', () => {
      const outputIds = videoQaNodeDefinition.outputs.map((entry) => entry.id);
      expect(outputIds).toEqual(['passed', 'report', 'video']);
    });

    it('should reference default data', () => {
      expect(videoQaNodeDefinition.defaultData).toBe(DEFAULT_VIDEO_QA_DATA);
    });
  });
});
