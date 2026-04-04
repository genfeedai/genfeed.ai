import { CredentialsService } from '@services/organization/credentials.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('CredentialsService', () => {
  let service: CredentialsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CredentialsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(CredentialsService);
    });
  });

  describe('credential management', () => {
    it('has findAll method for fetching all credentials', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single credential', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has post method for creating credentials', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has patch method for updating credentials', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing credentials', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });
});
