import { describe, expect, it } from 'vitest';
import { CaptionFormat, CaptionLanguage } from '../../src/enums/caption.enum';

describe('caption.enum', () => {
  describe('CaptionFormat', () => {
    it('should have correct values', () => {
      expect(CaptionFormat.SRT).toBe('srt');
      expect(CaptionFormat.VTT).toBe('vtt');
      expect(CaptionFormat.TXT).toBe('txt');
    });
  });

  describe('CaptionLanguage', () => {
    it('should have correct values', () => {
      expect(CaptionLanguage.EN).toBe('en');
      expect(CaptionLanguage.ES).toBe('es');
      expect(CaptionLanguage.FR).toBe('fr');
    });
  });
});
