import { describe, expect, it } from 'vitest';
import { ImageFormat } from '../../src/enums/image-format.enum';

describe('image-format.enum', () => {
  describe('ImageFormat', () => {
    it('should have correct values', () => {
      expect(ImageFormat.JPG).toBe('jpg');
      expect(ImageFormat.PNG).toBe('png');
      expect(ImageFormat.WEBP).toBe('webp');
      expect(ImageFormat.GIF).toBe('gif');
    });
  });
});
