import { OrganizationsService } from '@services/organization/organizations.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrganizationsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(OrganizationsService);
    });
  });

  describe('organization operations', () => {
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
