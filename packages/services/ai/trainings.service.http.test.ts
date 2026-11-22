import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { TrainingsService } from '@services/ai/trainings.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrainingsService HTTP methods', () => {
  let service: TrainingsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new TrainingsService('trainings-token');
    http = installMockHttp(service);
  });

  it('creates a training under an idempotency key the server can replay', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument({ label: 'Portrait' }, { id: 'training-1' }),
      ),
    );

    const training = await service.createIdempotent(
      { label: 'Portrait', sources: ['image-1'] },
      'request-1',
    );

    expect(http.post).toHaveBeenCalledExactlyOnceWith(
      '',
      { label: 'Portrait', sources: ['image-1'] },
      { headers: { 'Idempotency-Key': 'request-1' } },
    );
    expect(training).toMatchObject({ id: 'training-1', label: 'Portrait' });
  });
});
