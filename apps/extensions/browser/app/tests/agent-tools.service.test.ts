import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentToolsService } from '~services/agent-tools.service';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
}));

describe('AgentToolsService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('executes browser actions through their canonical agent tools', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { creditsUsed: 2, data: { content: 'generated' }, success: true },
    });
    vi.mocked(axios.create).mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      post,
    } as never);

    const service = new AgentToolsService('token');
    const result = await service.execute('generate', {
      topic: 'Launch update',
      type: 'post',
    });

    expect(post).toHaveBeenCalledWith('/agent-tools/generate_content/execute', {
      parameters: { topic: 'Launch update', type: 'post' },
    });
    expect(result).toEqual({
      creditsUsed: 2,
      data: { content: 'generated' },
      success: true,
    });
  });
});
