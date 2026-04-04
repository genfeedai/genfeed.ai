import { describe, expect, it } from 'vitest';
import { ImageFormat } from '../src/image-format.enum';

describe('image-format.enum', () => {
  describe('ImageFormat', () => {
    it('should have 4 members', () => {
      expect(Object.values(ImageFormat)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(ImageFormat.JPG).toBe('jpg');
      expect(ImageFormat.PNG).toBe('png');
      expect(ImageFormat.WEBP).toBe('webp');
      expect(ImageFormat.GIF).toBe('gif');
    });
  });
});
