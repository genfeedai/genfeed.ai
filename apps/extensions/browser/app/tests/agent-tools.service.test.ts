import { TargetExecutionState } from '@genfeedai/contracts';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentToolsService } from '~services/agent-tools.service';

vi.mock('axios', () => ({ default: { create: vi.fn() } }));

const post = vi.fn();
const get = vi.fn();

describe('AgentToolsService', () => {
  beforeEach(() => {
    vi.mocked(axios.create).mockReturnValue({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get,
      post,
    } as never);
    post.mockResolvedValue({
      data: { creditsUsed: 2, data: { content: 'generated' }, success: true },
    });
  });

  afterEach(() => vi.resetAllMocks());

  it.each([
    ['analytics', 'get_analytics', { days: 7 }],
    ['generate', 'generate_content', { topic: 'Launch update', type: 'post' }],
    ['image', 'generate_image', { prompt: 'Launch artwork' }],
    ['post', 'create_post', { content: 'Draft' }],
  ] as const)(
    'executes %s with one catalog request',
    async (action, tool, parameters) => {
      await new AgentToolsService('token').execute(action, parameters);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(`/agent-tools/${tool}/execute`, {
        parameters,
      });
    },
  );

  it('uses the generation result content and accepted request fields', async () => {
    await expect(
      new AgentToolsService('token').generateText(
        'Remix this',
        'tiktok',
        'script',
      ),
    ).resolves.toBe('generated');
    expect(post).toHaveBeenCalledWith('/agent-tools/generate_content/execute', {
      parameters: { platform: 'tiktok', topic: 'Remix this', type: 'script' },
    });
  });

  it('surfaces action failures even when HTTP succeeds', async () => {
    post.mockResolvedValue({
      data: { success: false, error: 'Insufficient credits' },
    });
    await expect(
      new AgentToolsService('token').generateText('Topic', 'twitter'),
    ).rejects.toThrow('Insufficient credits');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not report approval requests as completed writes', async () => {
    post.mockResolvedValue({
      data: { success: true, requiresConfirmation: true },
    });
    await expect(
      new AgentToolsService('token').execute('post', { content: 'Draft' }),
    ).rejects.toThrow('approval');
  });

  it('rejects empty generation results', async () => {
    post.mockResolvedValue({ data: { success: true, data: { content: '' } } });
    await expect(
      new AgentToolsService('token').generateText('Topic', 'twitter'),
    ).rejects.toThrow('No content');
  });

  it('creates a draft using the selected brand account and CreatePostDto fields', async () => {
    get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'credential-twitter',
            attributes: { isConnected: true, platform: 'twitter' },
          },
          {
            id: 'credential-linkedin',
            attributes: { isConnected: true, platform: 'linkedin' },
          },
        ],
      },
    });
    await new AgentToolsService('token').saveDraft(
      'Idea',
      'twitter',
      'Title',
      'brand-id',
    );
    expect(get).toHaveBeenCalledWith('/credentials', {
      params: { brandId: 'brand-id', limit: 100 },
    });
    expect(post).toHaveBeenCalledWith('/posts', {
      credentialId: 'credential-twitter',
      description: 'Idea',
      ingredients: [],
      label: 'Title',
      source: 'extension',
      targetExecutionState: TargetExecutionState.DRAFT,
    });
  });

  it('does not select an account without a brand', async () => {
    await expect(
      new AgentToolsService('token').saveDraft(
        'Idea',
        'twitter',
        'Title',
        null,
      ),
    ).rejects.toThrow('Select a brand');
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([0, 2])(
    'rejects ambiguous or absent connected accounts (%s)',
    async (count) => {
      get.mockResolvedValue({
        data: {
          data: Array.from({ length: count }, (_, index) => ({
            id: `account-${index}`,
            attributes: { isConnected: true, platform: 'twitter' },
          })),
        },
      });
      await expect(
        new AgentToolsService('token').saveDraft(
          'Idea',
          'twitter',
          'Title',
          'brand',
        ),
      ).rejects.toThrow();
      expect(post).not.toHaveBeenCalled();
    },
  );

  it('propagates rejected draft writes', async () => {
    get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'account',
            attributes: { isConnected: true, platform: 'twitter' },
          },
        ],
      },
    });
    post.mockRejectedValue(new Error('Account is unavailable'));
    await expect(
      new AgentToolsService('token').saveDraft(
        'Idea',
        'twitter',
        'Title',
        'brand',
      ),
    ).rejects.toThrow('Account is unavailable');
  });
});
