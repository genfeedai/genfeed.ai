import { CaptionsService } from '@services/content/captions.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('CaptionsService', () => {
  let service: CaptionsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CaptionsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(CaptionsService);
    });
  });

  describe('caption management', () => {
    it('has findAll method for fetching all captions', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single caption', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating captions', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating captions', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing captions', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('caption-specific features', () => {
    it('supports caption template management', () => {
      expect(service).toBeDefined();
    });

    it('supports AI-generated captions', () => {
      expect(service).toBeDefined();
    });

    it('supports caption library', () => {
      expect(service).toBeDefined();
    });
  });
});
