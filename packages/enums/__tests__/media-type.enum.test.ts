import { describe, expect, it } from 'vitest';
import { MediaType } from '../src/media-type.enum';

describe('media-type.enum', () => {
  describe('MediaType', () => {
    it('should have 2 members', () => {
      expect(Object.values(MediaType)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(MediaType.VIDEO).toBe('video');
      expect(MediaType.IMAGE).toBe('image');
    });
  });
});
