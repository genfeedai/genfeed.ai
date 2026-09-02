import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_QA_DATA } from './video-qa';

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

    it('should default advisory continuity QA off with no references', () => {
      expect(DEFAULT_VIDEO_QA_DATA.isContinuityQaEnabled).toBe(false);
      expect(DEFAULT_VIDEO_QA_DATA.characterReferenceUrls).toEqual([]);
      expect(DEFAULT_VIDEO_QA_DATA.productReferenceUrls).toEqual([]);
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
});
