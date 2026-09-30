import { BlacklistsService } from '@services/elements/blacklists.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('BlacklistsService', () => {
  let service: BlacklistsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BlacklistsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(BlacklistsService);
    });
  });

  describe('blacklist management', () => {
    it('has findAll method', () => {
      expect(service.findAll).toBeDefined();
    });

    it('has findOne method', () => {
      expect(service.findOne).toBeDefined();
    });

    it('has create method', () => {
      expect(service.post).toBeDefined();
    });

    it('has update method', () => {
      expect(service.patch).toBeDefined();
    });

    it('has delete method', () => {
      expect(service.delete).toBeDefined();
    });
  });
});
