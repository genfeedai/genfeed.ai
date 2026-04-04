import { describe, expect, it } from 'vitest';
import { Status } from '../src/status.enum';

describe('status.enum', () => {
  describe('Status', () => {
    it('should have 11 members', () => {
      expect(Object.values(Status)).toHaveLength(11);
    });

    it('should have correct values', () => {
      expect(Status.DRAFT).toBe('draft');
      expect(Status.PROCESSING).toBe('processing');
      expect(Status.UPLOADED).toBe('uploaded');
      expect(Status.GENERATED).toBe('generated');
      expect(Status.UPSCALED).toBe('upscaled');
      expect(Status.CAPTIONED).toBe('captioned');
      expect(Status.VALIDATED).toBe('validated');
      expect(Status.MERGED).toBe('merged');
      expect(Status.RESIZED).toBe('resized');
      expect(Status.COMPLETED).toBe('completed');
      expect(Status.FAILED).toBe('failed');
    });
  });
});
