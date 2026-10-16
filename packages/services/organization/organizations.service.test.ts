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
  patch: ReturnType<typeof vi.fn>;
};

type TestableOrganizationsService = Omit<OrganizationsService, 'instance'> & {
  extractCollection: (
    document: JsonApiResponseDocument,
  ) => OrganizationListItem[];
  instance: MockHttpClient;
};

function installHttp(service: OrganizationsService): {
  http: MockHttpClient;
  testable: TestableOrganizationsService;
} {
  const http: MockHttpClient = {
    get: vi.fn(),
    patch: vi.fn(),
  };
  const testable = service as unknown as TestableOrganizationsService;
  testable.instance = http;
  return { http, testable };
}

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
    it('coalesces concurrent callers onto a single GET ?mine=true request', async () => {
      const { http } = installHttp(service);
      let resolveGet: (value: { data: OrganizationListItem[] }) => void =
        () => {
          // assigned synchronously by the Promise executor below
        };
      const get = http.get.mockReturnValue(
        new Promise<{ data: OrganizationListItem[] }>((resolve) => {
          resolveGet = resolve;
        }),
      );

      const first = service.getMyOrganizations();
      const second = service.getMyOrganizations();

      // Both callers share the one in-flight promise while it is pending.
      expect(get).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);

      resolveGet({ data: [{ id: 'org_1', label: 'Org 1', slug: 'org-1' }] });
      await first;
    });

    it('refetches after the in-flight request settles', async () => {
      const { http } = installHttp(service);
      const get = http.get.mockResolvedValue({
        data: [] as OrganizationListItem[],
      });

      await service.getMyOrganizations();
      await service.getMyOrganizations();

      // The cache is in-flight-only (no TTL): a settled request clears the
      // field, so the next mount cycle fetches fresh membership data.
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('drops duplicate organizations by id', async () => {
      const { http } = installHttp(service);
      const get = http.get.mockResolvedValue({
        data: [
          { id: 'org_1', label: 'Org 1', slug: 'org-1' },
          { id: 'org_1', label: 'Org 1 dupe', slug: 'org-1' },
          { id: 'org_2', label: 'Org 2', slug: 'org-2' },
        ],
      });

      const result = await service.getMyOrganizations();

      expect(get).toHaveBeenCalledWith('', { params: { mine: true } });
      expect(result.map((org) => org.id)).toEqual(['org_1', 'org_2']);
    });

    it('clears the in-flight promise when the request rejects', async () => {
      const { http } = installHttp(service);
      const get = http.get
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ data: [] as OrganizationListItem[] });

      await expect(service.getMyOrganizations()).rejects.toThrow('network');
      // A failed request must not poison the cache — the next caller retries.
      await expect(service.getMyOrganizations()).resolves.toEqual([]);
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('starts a new GET for a fresh read and lets later callers join that read', async () => {
      const { http } = installHttp(service);
      let resolveStale: (value: { data: OrganizationListItem[] }) => void =
        () => undefined;
      let resolveFresh: (value: { data: OrganizationListItem[] }) => void =
        () => undefined;
      let calls = 0;
      const get = http.get.mockImplementation(
        () =>
          new Promise<{ data: OrganizationListItem[] }>((resolve) => {
            calls += 1;
            if (calls === 1) resolveStale = resolve;
            else resolveFresh = resolve;
          }),
      );

      const stale = service.getMyOrganizations();
      const fresh = service.getMyOrganizations({ fresh: true });
      const joined = service.getMyOrganizations();

      expect(get).toHaveBeenCalledTimes(2);
      expect(fresh).not.toBe(stale);
      expect(joined).toBe(fresh);

      resolveStale({ data: [{ id: 'org_old', label: 'Old', slug: 'old' }] });
      resolveFresh({ data: [{ id: 'org_new', label: 'New', slug: 'new' }] });

      await expect(stale).resolves.toEqual([
        expect.objectContaining({ id: 'org_old' }),
      ]);
      await expect(fresh).resolves.toEqual([
        expect.objectContaining({ id: 'org_new' }),
      ]);
      await expect(joined).resolves.toEqual([
        expect.objectContaining({ id: 'org_new' }),
      ]);
    });

    it('drops a membership read started before switchOrganization', async () => {
      const { http } = installHttp(service);
      let resolveStale: (value: { data: OrganizationListItem[] }) => void =
        () => undefined;
      const get = http.get
        .mockImplementationOnce(
          () =>
            new Promise<{ data: OrganizationListItem[] }>((resolve) => {
              resolveStale = resolve;
            }),
        )
        .mockResolvedValueOnce({
          data: [{ id: 'org_2', label: 'Org 2', slug: 'org-2' }],
        });
      const patch = http.patch.mockResolvedValue({
        data: {
          brand: { id: 'brand_2', label: 'Brand 2' },
          organization: { id: 'org_2', label: 'Org 2' },
        },
      });

      const stale = service.getMyOrganizations();
      await service.switchOrganization('org_2');
      const next = service.getMyOrganizations();

      expect(patch).toHaveBeenCalledWith('/org_2/activate');
      expect(get).toHaveBeenCalledTimes(2);
      expect(next).not.toBe(stale);

      resolveStale({ data: [{ id: 'org_1', label: 'Org 1', slug: 'org-1' }] });
      await expect(stale).resolves.toEqual([
        expect.objectContaining({ id: 'org_1' }),
      ]);
      await expect(next).resolves.toEqual([
        expect.objectContaining({ id: 'org_2' }),
      ]);
    });
  });

  describe('getAllOrganizations', () => {
    it('uses API-safe pagination and returns all organization pages', async () => {
      const { http, testable } = installHttp(service);
      const get = http.get
        .mockResolvedValueOnce({ data: createPage(1, 2) })
        .mockResolvedValueOnce({ data: createPage(2, 2) });

      vi.spyOn(testable, 'extractCollection')
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

  describe('findOrganizationPostsPage', () => {
    it('uses the canonical organizationId query filter', async () => {
      const { http, testable } = installHttp(service);
      const get = http.get.mockResolvedValue({
        data: {
          data: [],
          links: {
            pagination: { limit: 12, page: 1, pages: 1, total: 0 },
          },
        },
      });
      vi.spyOn(testable, 'extractCollection').mockReturnValue([]);

      await service.findOrganizationPostsPage('org_1', {
        limit: 12,
        page: 1,
      });

      expect(get).toHaveBeenCalledWith(expect.stringContaining('/posts'), {
        params: { limit: 12, organizationId: 'org_1', page: 1 },
      });
    });
  });
});
