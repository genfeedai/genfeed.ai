import { describe, expect, it } from 'vitest';
import { CaptionFormat, CaptionLanguage } from '../src/caption.enum';

describe('caption.enum', () => {
  describe('CaptionFormat', () => {
    it('should have 3 members', () => {
      expect(Object.values(CaptionFormat)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CaptionFormat.SRT).toBe('srt');
      expect(CaptionFormat.VTT).toBe('vtt');
      expect(CaptionFormat.TXT).toBe('txt');
    });
  });

  describe('CaptionLanguage', () => {
    it('should have 3 members', () => {
      expect(Object.values(CaptionLanguage)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CaptionLanguage.EN).toBe('en');
      expect(CaptionLanguage.ES).toBe('es');
      expect(CaptionLanguage.FR).toBe('fr');
    });
  });
});
