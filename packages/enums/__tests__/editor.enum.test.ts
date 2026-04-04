import { describe, expect, it } from 'vitest';
import {
  EditorEffectType,
  EditorProjectStatus,
  EditorTrackType,
  EditorTransitionType,
} from '../src/editor.enum';

describe('editor.enum', () => {
  describe('EditorProjectStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(EditorProjectStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(EditorProjectStatus.DRAFT).toBe('draft');
      expect(EditorProjectStatus.RENDERING).toBe('rendering');
      expect(EditorProjectStatus.COMPLETED).toBe('completed');
      expect(EditorProjectStatus.FAILED).toBe('failed');
    });
  });

  describe('EditorTrackType', () => {
    it('should have 3 members', () => {
      expect(Object.values(EditorTrackType)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(EditorTrackType.VIDEO).toBe('video');
      expect(EditorTrackType.AUDIO).toBe('audio');
      expect(EditorTrackType.TEXT).toBe('text');
    });
  });

  describe('EditorTransitionType', () => {
    it('should have 5 members', () => {
      expect(Object.values(EditorTransitionType)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(EditorTransitionType.NONE).toBe('none');
      expect(EditorTransitionType.FADE).toBe('fade');
      expect(EditorTransitionType.DISSOLVE).toBe('dissolve');
      expect(EditorTransitionType.WIPE).toBe('wipe');
      expect(EditorTransitionType.SLIDE).toBe('slide');
    });
  });

  describe('EditorEffectType', () => {
    it('should have 7 members', () => {
      expect(Object.values(EditorEffectType)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(EditorEffectType.NONE).toBe('none');
      expect(EditorEffectType.BLUR).toBe('blur');
      expect(EditorEffectType.BRIGHTNESS).toBe('brightness');
      expect(EditorEffectType.CONTRAST).toBe('contrast');
      expect(EditorEffectType.SATURATION).toBe('saturation');
      expect(EditorEffectType.GRAYSCALE).toBe('grayscale');
      expect(EditorEffectType.SEPIA).toBe('sepia');
    });
  });
});
