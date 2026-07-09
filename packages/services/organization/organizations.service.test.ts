import type { JsonApiResponseDocument } from '@services/core/base.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type OrganizationListItem = {
  id: string;
  label: string;
  slug: string;
};

type MockHttpClient = {
  get: ReturnType<typeof vi.fn>;
};

type TestableOrganizationsService = OrganizationsService & {
  extractCollection: (
    document: JsonApiResponseDocument,
  ) => OrganizationListItem[];
  instance: MockHttpClient;
};

function createPage(page: number, pages: number): JsonApiResponseDocument {
  return {
    data: [],
    links: {
      pagination: {
        limit: 100,
        page,
        pages,
        total: pages * 100,
      },
    },
  };
}

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

  describe('getAllOrganizations', () => {
    it('uses API-safe pagination and returns all organization pages', async () => {
      const testableService =
        service as unknown as TestableOrganizationsService;
      const get = vi
        .fn()
        .mockResolvedValueOnce({ data: createPage(1, 2) })
        .mockResolvedValueOnce({ data: createPage(2, 2) });
      testableService.instance = { get };

      vi.spyOn(testableService, 'extractCollection')
        .mockReturnValueOnce([{ id: 'org_1', label: 'Org 1', slug: 'org-1' }])
        .mockReturnValueOnce([{ id: 'org_2', label: 'Org 2', slug: 'org-2' }]);

      const result = await service.getAllOrganizations();

      expect(get).toHaveBeenNthCalledWith(1, '', {
        params: { limit: 100, page: 1 },
      });
      expect(get).toHaveBeenNthCalledWith(2, '', {
        params: { limit: 100, page: 2 },
      });
      expect(result).toEqual([
        { id: 'org_1', label: 'Org 1', slug: 'org-1' },
        { id: 'org_2', label: 'Org 2', slug: 'org-2' },
      ]);
    });
  });
});
