import { describe, expect, it } from 'vitest';
import { UploadStatus } from '../src/upload-status.enum';

describe('upload-status.enum', () => {
  describe('UploadStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(UploadStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(UploadStatus.PENDING).toBe('pending');
      expect(UploadStatus.UPLOADING).toBe('uploading');
      expect(UploadStatus.COMPLETED).toBe('completed');
      expect(UploadStatus.FAILED).toBe('failed');
    });
  });
});
