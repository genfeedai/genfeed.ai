import { describe, expect, it } from 'vitest';
import { MediaType } from '../../src/enums/media-type.enum';

describe('media-type.enum', () => {
  describe('MediaType', () => {
    it('should have correct values', () => {
      expect(MediaType.VIDEO).toBe('video');
      expect(MediaType.IMAGE).toBe('image');
    });
  });
});
