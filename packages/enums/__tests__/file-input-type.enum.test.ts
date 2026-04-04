import { describe, expect, it } from 'vitest';
import { FileInputType } from '../src/file-input-type.enum';

describe('file-input-type.enum', () => {
  describe('FileInputType', () => {
    it('should have 4 members', () => {
      expect(Object.values(FileInputType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(FileInputType.FILE).toBe('file');
      expect(FileInputType.URL).toBe('url');
      expect(FileInputType.BASE64).toBe('base64');
      expect(FileInputType.BUFFER).toBe('buffer');
    });
  });
});
