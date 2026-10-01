import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class {
    instance = http;
    static getBaseServiceInstance(
      Service: new (token: string) => unknown,
      token: string,
    ) {
      return new Service(token);
    }
  },
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.example.test' },
}));

import { ContentLearningService } from './content-learning.service';

describe('learning backend contract parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.get.mockResolvedValue({
      data: {
        data: {
          id: 'account',
          type: 'content-learning-account',
          attributes: { mode: 'shadow', revision: 3 },
        },
      },
    });
    http.post.mockResolvedValue({
      data: {
        data: {
          id: 'operation',
          type: 'content-learning-operation',
          attributes: { status: 'completed' },
        },
      },
    });
    http.patch.mockResolvedValue({
      data: {
        data: {
          id: 'operation',
          type: 'content-learning-operation',
          attributes: { status: 'completed' },
        },
      },
    });
  });
  it('forwards expected revisions and explicit notice without caller arm/probability fields', async () => {
    const service = new ContentLearningService('token'),
      body = {
        enabled: true,
        noticeVersion: 'shared_strategy_training_v1',
        expectedRevision: 3,
        requestId: 'request',
      };
    await service.sharing('credential', body);
    expect(http.patch).toHaveBeenCalledWith(
      'accounts/credential/sharing',
      body,
    );
  });
  it('uses the root admin URL and exposes cooperative job operations', async () => {
    const service = new ContentLearningService('token');
    await service.train('dataset', 'request');
    expect(http.post).toHaveBeenCalledWith(
      'https://api.example.test/admin/content-learning/datasets/dataset/train',
      { requestId: 'request' },
    );
  });
  it('forwards AbortSignal through read methods', async () => {
    const service = new ContentLearningService('token'),
      controller = new AbortController();
    await service.account('credential', controller.signal);
    expect(http.get).toHaveBeenCalledWith('accounts/credential', {
      signal: controller.signal,
    });
  });
});
