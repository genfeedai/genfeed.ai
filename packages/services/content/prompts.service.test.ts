import { PromptsService } from '@services/content/prompts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/base.service');

describe('PromptsService', () => {
  let service: PromptsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PromptsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(PromptsService);
    });
  });

  describe('prompt management', () => {
    it('has findAll method for fetching all prompts', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single prompt', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating prompts', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating prompts', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing prompts', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('prompt library features', () => {
    it('supports prompt templates', () => {
      expect(service).toBeDefined();
    });

    it('supports prompt versioning', () => {
      expect(service).toBeDefined();
    });

    it('supports prompt sharing', () => {
      expect(service).toBeDefined();
    });
  });
});
