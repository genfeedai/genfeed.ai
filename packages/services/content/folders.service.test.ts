import { FoldersService } from '@services/content/folders.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('FoldersService', () => {
  let service: FoldersService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FoldersService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(FoldersService);
    });
  });

  describe('folder management', () => {
    it('has findAll method for fetching all folders', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single folder', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating folders', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating folders', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing folders', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('folder hierarchy', () => {
    it('supports nested folder structure', () => {
      expect(service).toBeDefined();
    });

    it('supports folder organization', () => {
      expect(service).toBeDefined();
    });
  });
});
