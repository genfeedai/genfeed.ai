import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOUND_OVERLAY_DATA,
  soundOverlayNodeDefinition,
} from './sound-overlay';

describe('sound-overlay node', () => {
  describe('DEFAULT_SOUND_OVERLAY_DATA', () => {
    it('should have label set to Sound Overlay', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.label).toBe('Sound Overlay');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.status).toBe('idle');
    });

    it('should default mixMode to replace', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.mixMode).toBe('replace');
    });

    it('should default audioVolume to 100 and videoVolume to 0', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.audioVolume).toBe(100);
      expect(DEFAULT_SOUND_OVERLAY_DATA.videoVolume).toBe(0);
    });

    it('should default fadeIn and fadeOut to 0', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.fadeIn).toBe(0);
      expect(DEFAULT_SOUND_OVERLAY_DATA.fadeOut).toBe(0);
    });

    it('should default input URLs to null', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.videoUrl).toBeNull();
      expect(DEFAULT_SOUND_OVERLAY_DATA.soundUrl).toBeNull();
    });

    it('should default output and processing fields to null', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.outputVideoUrl).toBeNull();
      expect(DEFAULT_SOUND_OVERLAY_DATA.jobId).toBeNull();
      expect(DEFAULT_SOUND_OVERLAY_DATA.processingProgress).toBeNull();
    });
  });

  describe('soundOverlayNodeDefinition', () => {
    it('should have type soundOverlay', () => {
      expect(soundOverlayNodeDefinition.type).toBe('soundOverlay');
    });

    it('should be in processing category', () => {
      expect(soundOverlayNodeDefinition.category).toBe('processing');
    });

    it('should have label Sound Overlay', () => {
      expect(soundOverlayNodeDefinition.label).toBe('Sound Overlay');
    });

    it('should require videoUrl and soundUrl inputs', () => {
      expect(soundOverlayNodeDefinition.inputs).toHaveLength(2);
      const videoInput = soundOverlayNodeDefinition.inputs.find(
        (i) => i.id === 'videoUrl',
      );
      const soundInput = soundOverlayNodeDefinition.inputs.find(
        (i) => i.id === 'soundUrl',
      );
      expect(videoInput?.required).toBe(true);
      expect(soundInput?.required).toBe(true);
    });

    it('should output a single videoUrl', () => {
      expect(soundOverlayNodeDefinition.outputs).toHaveLength(1);
      expect(soundOverlayNodeDefinition.outputs[0].id).toBe('videoUrl');
    });

    it('should reference default data', () => {
      expect(soundOverlayNodeDefinition.defaultData).toBe(
        DEFAULT_SOUND_OVERLAY_DATA,
      );
    });
  });
});
