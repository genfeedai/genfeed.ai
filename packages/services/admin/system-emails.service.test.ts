import { AdminSystemEmailsService } from '@services/admin/system-emails.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      get: mockGet,
    };

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: never[]) => T,
      ...args: never[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('AdminSystemEmailsService', () => {
  let service: AdminSystemEmailsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminSystemEmailsService('test-token');
  });

  it('fetches system email definitions as a plain registry response', async () => {
    const signal = new AbortController().signal;
    mockGet.mockResolvedValue({
      data: [
        {
          id: 'welcome-day-0',
          subject: 'Welcome to Genfeed.ai',
        },
      ],
    });

    await expect(service.getSystemEmails(signal)).resolves.toEqual([
      {
        id: 'welcome-day-0',
        subject: 'Welcome to Genfeed.ai',
      },
    ]);
    expect(mockGet).toHaveBeenCalledWith('', { signal });
  });
});
