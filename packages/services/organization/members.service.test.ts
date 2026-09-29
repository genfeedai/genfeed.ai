import { MembersService } from '@services/organization/members.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock BaseService
vi.mock('@services/core/base.service');

describe('MembersService', () => {
  let service: MembersService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MembersService(mockToken);
  });

  describe('inheritance from BaseService', () => {
    it('has findAll method', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has create method', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has update method', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });
});
