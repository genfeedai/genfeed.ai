import { describe, expect, it } from 'vitest';
import {
  ContentIntelligencePlatform,
  ContentPatternCategory,
  ContentPatternType,
  CreatorAnalysisStatus,
} from '../src/content-intelligence.enum';

describe('content-intelligence.enum', () => {
  describe('CreatorAnalysisStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(CreatorAnalysisStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(CreatorAnalysisStatus.PENDING).toBe('pending');
      expect(CreatorAnalysisStatus.SCRAPING).toBe('scraping');
      expect(CreatorAnalysisStatus.ANALYZING).toBe('analyzing');
      expect(CreatorAnalysisStatus.COMPLETED).toBe('completed');
      expect(CreatorAnalysisStatus.FAILED).toBe('failed');
    });
  });

  describe('ContentPatternType', () => {
    it('should have 5 members', () => {
      expect(Object.values(ContentPatternType)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ContentPatternType.HOOK).toBe('hook');
      expect(ContentPatternType.TEMPLATE).toBe('template');
      expect(ContentPatternType.CTA).toBe('cta');
      expect(ContentPatternType.STRUCTURE).toBe('structure');
      expect(ContentPatternType.HEADLINE).toBe('headline');
    });
  });

  describe('ContentPatternCategory', () => {
    it('should have 8 members', () => {
      expect(Object.values(ContentPatternCategory)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(ContentPatternCategory.STORY).toBe('story');
      expect(ContentPatternCategory.CONTRARIAN).toBe('contrarian');
      expect(ContentPatternCategory.CASE_STUDY).toBe('case_study');
      expect(ContentPatternCategory.LIST).toBe('list');
      expect(ContentPatternCategory.CURATION).toBe('curation');
      expect(ContentPatternCategory.GIVEAWAY).toBe('giveaway');
      expect(ContentPatternCategory.THREAD).toBe('thread');
      expect(ContentPatternCategory.QUESTION).toBe('question');
    });
  });

  describe('ContentIntelligencePlatform', () => {
    it('should have 4 members', () => {
      expect(Object.values(ContentIntelligencePlatform)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(ContentIntelligencePlatform.LINKEDIN).toBe('linkedin');
      expect(ContentIntelligencePlatform.TWITTER).toBe('twitter');
      expect(ContentIntelligencePlatform.INSTAGRAM).toBe('instagram');
      expect(ContentIntelligencePlatform.TIKTOK).toBe('tiktok');
    });
  });
});
