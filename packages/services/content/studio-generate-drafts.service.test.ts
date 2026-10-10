import type { StudioGenerateDraftPayload } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { StudioGenerateDraftsService } from '@services/content/studio-generate-drafts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockMapOne, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockMapOne: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    protected instance = { get: mockGet, put: mockPut };
    protected mapOne = mockMapOne;

    protected executeWithErrorHandling<R>(
      _operation: string,
      promise: Promise<R>,
    ): Promise<R> {
      return promise;
    }

    static getDataServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { BaseService: MockBaseService };
});

const payload: StudioGenerateDraftPayload = {
  attachments: [],
  knowledgeSelection: {},
  prompt: 'A lighthouse at dawn',
  references: [],
  settingsByType: {},
  type: 'image',
};

describe('StudioGenerateDraftsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the draft of the brand open in this tab', async () => {
    const signal = new AbortController().signal;
    mockGet.mockResolvedValue({ data: { data: null }, status: 200 });

    const service = new StudioGenerateDraftsService('token');

    await expect(service.getCurrent('brand-a', signal)).resolves.toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/current', {
      params: { brand: 'brand-a' },
      signal,
    });
    expect(mockMapOne).not.toHaveBeenCalled();
  });

  it('writes the draft under the brand open in this tab', async () => {
    const signal = new AbortController().signal;
    mockPut.mockResolvedValue({ data: { data: { id: 'draft-1' } } });
    mockMapOne.mockResolvedValue({ id: 'draft-1' });

    const service = new StudioGenerateDraftsService('token');
    await service.saveCurrent('brand-a', payload, { signal });

    expect(mockPut).toHaveBeenCalledWith(
      '/current',
      { ...payload, brandId: 'brand-a' },
      { signal },
    );
  });

  it('sends an unload flush with keepalive so it survives navigation', async () => {
    mockPut.mockResolvedValue({ data: { data: { id: 'draft-1' } } });

    const service = new StudioGenerateDraftsService('token');
    await service.saveCurrent('brand-a', payload, { isKeepalive: true });

    expect(mockPut).toHaveBeenCalledWith(
      '/current',
      { ...payload, brandId: 'brand-a' },
      { adapter: 'fetch', fetchOptions: { keepalive: true } },
    );
  });
});
