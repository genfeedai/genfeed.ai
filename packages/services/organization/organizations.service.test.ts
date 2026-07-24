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

  describe('getMyOrganizations', () => {
    it('coalesces concurrent callers onto a single GET /mine request', async () => {
      const testableService =
        service as unknown as TestableOrganizationsService;
      let resolveGet: (value: { data: OrganizationListItem[] }) => void =
        () => {
          // assigned synchronously by the Promise executor below
        };
      const get = vi.fn().mockReturnValue(
        new Promise<{ data: OrganizationListItem[] }>((resolve) => {
          resolveGet = resolve;
        }),
      );
      testableService.instance = { get };

      const first = service.getMyOrganizations();
      const second = service.getMyOrganizations();

      // Both callers share the one in-flight promise while it is pending.
      expect(get).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);

      resolveGet({ data: [{ id: 'org_1', label: 'Org 1', slug: 'org-1' }] });
      await first;
    });

    it('refetches after the in-flight request settles', async () => {
      const testableService =
        service as unknown as TestableOrganizationsService;
      const get = vi
        .fn()
        .mockResolvedValue({ data: [] as OrganizationListItem[] });
      testableService.instance = { get };

      await service.getMyOrganizations();
      await service.getMyOrganizations();

      // The cache is in-flight-only (no TTL): a settled request clears the
      // field, so the next mount cycle fetches fresh membership data.
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('drops duplicate organizations by id', async () => {
      const testableService =
        service as unknown as TestableOrganizationsService;
      const get = vi.fn().mockResolvedValue({
        data: [
          { id: 'org_1', label: 'Org 1', slug: 'org-1' },
          { id: 'org_1', label: 'Org 1 dupe', slug: 'org-1' },
          { id: 'org_2', label: 'Org 2', slug: 'org-2' },
        ],
      });
      testableService.instance = { get };

      const result = await service.getMyOrganizations();

      expect(get).toHaveBeenCalledWith('/mine');
      expect(result.map((org) => org.id)).toEqual(['org_1', 'org_2']);
    });

    it('clears the in-flight promise when the request rejects', async () => {
      const testableService =
        service as unknown as TestableOrganizationsService;
      const get = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ data: [] as OrganizationListItem[] });
      testableService.instance = { get };

      await expect(service.getMyOrganizations()).rejects.toThrow('network');
      // A failed request must not poison the cache — the next caller retries.
      await expect(service.getMyOrganizations()).resolves.toEqual([]);
      expect(get).toHaveBeenCalledTimes(2);
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
