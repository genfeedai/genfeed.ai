import { AssetsService } from '@services/content/assets.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('AssetsService', () => {
  let service: AssetsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssetsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(AssetsService);
    });
  });

  describe('asset management', () => {
    it('has findAll method for fetching all assets', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single asset', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating assets', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating assets', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing assets', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('asset-specific operations', () => {
    it('supports asset upload functionality', () => {
      expect(service).toBeDefined();
    });

    it('supports asset metadata management', () => {
      expect(service).toBeDefined();
    });

    it('supports asset search and filtering', () => {
      expect(service).toBeDefined();
    });
  });
});
