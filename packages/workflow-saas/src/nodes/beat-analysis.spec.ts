import { BeatSensitivity } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  beatAnalysisNodeDefinition,
  DEFAULT_BEAT_ANALYSIS_DATA,
} from './beat-analysis';

describe('beat-analysis node', () => {
  describe('DEFAULT_BEAT_ANALYSIS_DATA', () => {
    it('should have label set to Beat Analysis', () => {
      expect(DEFAULT_BEAT_ANALYSIS_DATA.label).toBe('Beat Analysis');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_BEAT_ANALYSIS_DATA.status).toBe('idle');
    });

    it('should default beatSensitivity to MEDIUM', () => {
      expect(DEFAULT_BEAT_ANALYSIS_DATA.beatSensitivity).toBe(
        BeatSensitivity.MEDIUM,
      );
    });

    it('should default BPM range to 60-200', () => {
      expect(DEFAULT_BEAT_ANALYSIS_DATA.minBpm).toBe(60);
      expect(DEFAULT_BEAT_ANALYSIS_DATA.maxBpm).toBe(200);
    });

    it('should default musicUrl to null', () => {
      expect(DEFAULT_BEAT_ANALYSIS_DATA.musicUrl).toBeNull();
    });

    it('should default output arrays to empty', () => {
      expect(DEFAULT_BEAT_ANALYSIS_DATA.beatTimestamps).toEqual([]);
      expect(DEFAULT_BEAT_ANALYSIS_DATA.downbeats).toEqual([]);
    });

    it('should default processing info to null', () => {
      expect(DEFAULT_BEAT_ANALYSIS_DATA.tempo).toBeNull();
      expect(DEFAULT_BEAT_ANALYSIS_DATA.beatCount).toBeNull();
      expect(DEFAULT_BEAT_ANALYSIS_DATA.analysisMethod).toBeNull();
      expect(DEFAULT_BEAT_ANALYSIS_DATA.confidence).toBeNull();
    });
  });

  describe('beatAnalysisNodeDefinition', () => {
    it('should have type beatAnalysis', () => {
      expect(beatAnalysisNodeDefinition.type).toBe('beatAnalysis');
    });

    it('should be in processing category', () => {
      expect(beatAnalysisNodeDefinition.category).toBe('processing');
    });

    it('should have label Beat Analysis', () => {
      expect(beatAnalysisNodeDefinition.label).toBe('Beat Analysis');
    });

    it('should require musicUrl input', () => {
      expect(beatAnalysisNodeDefinition.inputs).toHaveLength(1);
      expect(beatAnalysisNodeDefinition.inputs[0].id).toBe('musicUrl');
      expect(beatAnalysisNodeDefinition.inputs[0].required).toBe(true);
    });

    it('should output tempo, beatTimestamps, downbeats, and beatCount', () => {
      const outputIds = beatAnalysisNodeDefinition.outputs.map((o) => o.id);
      expect(outputIds).toEqual([
        'tempo',
        'beatTimestamps',
        'downbeats',
        'beatCount',
      ]);
    });

    it('should reference default data', () => {
      expect(beatAnalysisNodeDefinition.defaultData).toBe(
        DEFAULT_BEAT_ANALYSIS_DATA,
      );
    });
  });
});
