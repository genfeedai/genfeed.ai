import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

describe('loadRequestScope', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('reads organization and brand from bootstrap and caches them by token', async () => {
    vi.resetModules();
    fetchMock.mockResolvedValue({
      json: async () => ({
        access: { brandId: 'brand-1', organizationId: ' org-1 ' },
      }),
      ok: true,
      status: 200,
    });

    const { loadRequestScope } = await import('@/services/api/request-scope');

    await expect(loadRequestScope('token-a')).resolves.toEqual({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
    await loadRequestScope('token-a');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.test.com/v1/auth/bootstrap',
    );
  });

  it('refuses to call collection endpoints when brand scope is missing', async () => {
    vi.resetModules();
    fetchMock.mockResolvedValue({
      json: async () => ({ access: { organizationId: 'org-1' } }),
      ok: true,
      status: 200,
    });

    const { loadRequestScope } = await import('@/services/api/request-scope');

    await expect(loadRequestScope('token-b')).rejects.toMatchObject({
      message:
        'An organization and brand are required before this workspace can load.',
      status: 403,
    });
  });
});
