import { describe, expect, it } from 'vitest';
import { FileCategory } from '../src/file.enum';

describe('file.enum', () => {
  describe('FileCategory', () => {
    it('should have 7 members', () => {
      expect(Object.values(FileCategory)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(FileCategory.IMAGE).toBe('image');
      expect(FileCategory.VIDEO).toBe('video');
      expect(FileCategory.AUDIO).toBe('audio');
      expect(FileCategory.DOCUMENT).toBe('document');
      expect(FileCategory.TEXT).toBe('text');
      expect(FileCategory.ARCHIVE).toBe('archive');
      expect(FileCategory.OTHER).toBe('other');
    });
  });
});
