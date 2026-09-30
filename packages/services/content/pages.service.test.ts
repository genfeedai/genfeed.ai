import { PagesService } from '@services/content/pages.service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('PagesService', () => {
  beforeEach(() => {
    // Reset state between tests
    PagesService.setCurrentPage(1);
    PagesService.setTotalPages(1);
    PagesService.setTotalDocs(0);
  });

  describe('currentPage', () => {
    it('returns default value of 1', () => {
      expect(PagesService.getCurrentPage()).toBe(1);
    });

    it('sets and gets current page', () => {
      PagesService.setCurrentPage(5);
      expect(PagesService.getCurrentPage()).toBe(5);
    });

    it('enforces minimum value of 1', () => {
      PagesService.setCurrentPage(0);
      expect(PagesService.getCurrentPage()).toBe(1);

      PagesService.setCurrentPage(-5);
      expect(PagesService.getCurrentPage()).toBe(1);
    });

    it('accepts valid page numbers', () => {
      PagesService.setCurrentPage(100);
      expect(PagesService.getCurrentPage()).toBe(100);
    });
  });

  describe('totalPages', () => {
    it('returns default value of 1', () => {
      expect(PagesService.getTotalPages()).toBe(1);
    });

    it('sets and gets total pages', () => {
      PagesService.setTotalPages(10);
      expect(PagesService.getTotalPages()).toBe(10);
    });

    it('enforces minimum value of 1', () => {
      PagesService.setTotalPages(0);
      expect(PagesService.getTotalPages()).toBe(1);

      PagesService.setTotalPages(-3);
      expect(PagesService.getTotalPages()).toBe(1);
    });
  });

  describe('totalDocs', () => {
    it('returns default value of 0', () => {
      expect(PagesService.getTotalDocs()).toBe(0);
    });

    it('sets and gets total docs', () => {
      PagesService.setTotalDocs(42);
      expect(PagesService.getTotalDocs()).toBe(42);
    });

    it('enforces minimum value of 0', () => {
      PagesService.setTotalDocs(-1);
      expect(PagesService.getTotalDocs()).toBe(0);
    });

    it('accepts large values', () => {
      PagesService.setTotalDocs(999999);
      expect(PagesService.getTotalDocs()).toBe(999999);
    });
  });
});
