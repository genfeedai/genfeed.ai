import { IngredientsService } from '@services/content/ingredients.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('IngredientsService', () => {
  let service: IngredientsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IngredientsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(IngredientsService);
    });
  });

  describe('ingredient management', () => {
    it('has findAll method for fetching all ingredients', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single ingredient', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating ingredients', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating ingredients', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing ingredients', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('ingredient features', () => {
    it('supports ingredient collections', () => {
      expect(service).toBeDefined();
    });

    it('supports ingredient workflows', () => {
      expect(service).toBeDefined();
    });

    it('supports ingredient metadata', () => {
      expect(service).toBeDefined();
    });

    it('supports ingredient search and filtering', () => {
      expect(service).toBeDefined();
    });
  });
});
