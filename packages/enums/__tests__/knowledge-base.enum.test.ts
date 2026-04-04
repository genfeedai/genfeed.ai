import { describe, expect, it } from 'vitest';
import {
  KnowledgeBaseCategory,
  KnowledgeBaseStatus,
} from '../src/knowledge-base.enum';

describe('knowledge-base.enum', () => {
  describe('KnowledgeBaseStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(KnowledgeBaseStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(KnowledgeBaseStatus.DRAFT).toBe('draft');
      expect(KnowledgeBaseStatus.PROCESSING).toBe('processing');
      expect(KnowledgeBaseStatus.COMPLETED).toBe('completed');
      expect(KnowledgeBaseStatus.FAILED).toBe('failed');
    });
  });

  describe('KnowledgeBaseCategory', () => {
    it('should have 6 members', () => {
      expect(Object.values(KnowledgeBaseCategory)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(KnowledgeBaseCategory.URL).toBe('url');
      expect(KnowledgeBaseCategory.VIDEO).toBe('video');
      expect(KnowledgeBaseCategory.DOCUMENT).toBe('document');
      expect(KnowledgeBaseCategory.AUDIO).toBe('audio');
      expect(KnowledgeBaseCategory.RSS).toBe('rss');
      expect(KnowledgeBaseCategory.FILE).toBe('file');
    });
  });
});
