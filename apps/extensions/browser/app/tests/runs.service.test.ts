import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMocks = vi.hoisted(() => ({
  create: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  requestInterceptor: vi.fn(),
  responseInterceptor: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: axiosMocks.create,
  },
}));

vi.mock('~services/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.example.test',
  },
}));

import { type RunRecord, RunsService } from '~services/runs.service';

const runningRun: RunRecord = {
  actionType: 'generate',
  id: 'run-1',
  progress: 1,
  status: 'running',
};

describe('RunsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMocks.create.mockReturnValue({
      get: vi.fn(),
      interceptors: {
        request: { use: axiosMocks.requestInterceptor },
        response: { use: axiosMocks.responseInterceptor },
      },
      patch: axiosMocks.patch,
      post: axiosMocks.post,
    });
  });

  it('executes a run through the PATCH status transition', async () => {
    axiosMocks.patch.mockResolvedValue({ data: runningRun });
    const service = new RunsService('token');

    await expect(service.executeRun('run-1')).resolves.toEqual(runningRun);

    expect(axiosMocks.patch).toHaveBeenCalledWith('/run-1', {
      status: 'running',
    });
    expect(axiosMocks.post).not.toHaveBeenCalled();
  });

  it('uses the same PATCH transition after creating a run', async () => {
    const pendingRun: RunRecord = {
      ...runningRun,
      progress: 0,
      status: 'pending',
    };
    axiosMocks.post.mockResolvedValue({
      data: { reused: false, run: pendingRun },
    });
    axiosMocks.patch.mockResolvedValue({ data: runningRun });
    const service = new RunsService('token');

    await expect(
      service.createAndExecuteRun('generate', { prompt: 'hello' }),
    ).resolves.toEqual(runningRun);

    expect(axiosMocks.post).toHaveBeenCalledTimes(1);
    expect(axiosMocks.patch).toHaveBeenCalledWith('/run-1', {
      status: 'running',
    });
  });
});
