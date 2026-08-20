import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postWorkflowExecution } from './execution-http-client';

const mocks = vi.hoisted(() => ({
  deserializeResource: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@helpers/data/json-api/json-api.helper', () => ({
  deserializeResource: mocks.deserializeResource,
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: mocks.post,
  },
}));

describe('postWorkflowExecution', () => {
  beforeEach(() => {
    mocks.deserializeResource.mockReset();
    mocks.post.mockReset();
  });

  it('unwraps a JSON:API execution so canvas Run can read execution.id', async () => {
    const document = {
      data: {
        attributes: { progress: 100, status: 'completed' },
        id: 'exec-prompt',
        type: 'workflow-execution',
      },
    };
    mocks.post.mockResolvedValue(document);
    mocks.deserializeResource.mockReturnValue({
      id: 'exec-prompt',
      progress: 100,
      status: 'completed',
    });

    await expect(
      postWorkflowExecution('/workflows/wf-1/execute', { debugMode: false }),
    ).resolves.toEqual({
      id: 'exec-prompt',
      progress: 100,
      status: 'completed',
    });
    expect(mocks.deserializeResource).toHaveBeenCalledWith(document);
  });

  it('passes through a bare execution payload', async () => {
    mocks.post.mockResolvedValue({ id: 'exec-1' });

    await expect(
      postWorkflowExecution('/workflows/wf-1/execute', {}),
    ).resolves.toEqual({ id: 'exec-1' });
    expect(mocks.deserializeResource).not.toHaveBeenCalled();
  });
});
