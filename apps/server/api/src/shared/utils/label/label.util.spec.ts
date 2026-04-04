import { generateLabel } from '@api/shared/utils/label/label.util';
import { describe, expect, it } from 'vitest';

describe('LabelUtil', () => {
  it('should be defined', () => {
    expect(generateLabel).toBeDefined();
  });

  describe('generateLabel', () => {
    it('returns a non-empty string', () => {
      const label = generateLabel();
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });

    it('returns a label with exactly 6 characters by default', () => {
      const label = generateLabel();
      expect(label.length).toBe(6);
    });

    it('returns a prefixed label when prefix provided', () => {
      const label = generateLabel('video');
      expect(label.startsWith('video-')).toBe(true);
    });

    it('prefixed label has correct format: prefix-<6chars>', () => {
      const label = generateLabel('img');
      const parts = label.split('-');
      expect(parts.length).toBe(2);
      expect(parts[0]).toBe('img');
      expect(parts[1].length).toBe(6);
    });

    it('generates different labels on each call', () => {
      const label1 = generateLabel();
      const label2 = generateLabel();
      // Very unlikely to be the same (1 in 62^6 chance)
      expect(label1).not.toBe(label2);
    });

    it('handles empty string prefix same as no prefix', () => {
      const withEmpty = generateLabel('');
      const withoutPrefix = generateLabel();
      expect(withEmpty.length).toBe(withoutPrefix.length);
    });

    it('works with various prefixes', () => {
      const prefixes = ['video', 'audio', 'image', 'doc', 'task'];
      for (const prefix of prefixes) {
        const label = generateLabel(prefix);
        expect(label.startsWith(`${prefix}-`)).toBe(true);
      }
    });
  });
});
