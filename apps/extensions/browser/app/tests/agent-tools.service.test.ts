import { TargetExecutionState } from '@genfeedai/contracts';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentActionError,
  AgentToolsService,
} from '~services/agent-tools.service';

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
    ['image', 'generate', { prompt: 'Launch artwork', type: 'image' }],
    ['post', 'create_post', { content: 'Draft' }],
    ['refine', 'refine_text', { mode: 'rewrite', text: 'Draft' }],
    ['replies', 'generate_reply_variants', { tone: 'agree' }],
  ] as const)(
    'executes %s with one catalog request',
    async (action, tool, parameters) => {
      await new AgentToolsService('token').execute(action, parameters);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(`/agent-tools/${tool}/execute`, {
        parameters,
        context: { brandId: 'brand-1' },
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
      parameters: {
        brandId: 'brand-1',
        platform: 'tiktok',
        topic: 'Remix this',
        type: 'script',
      },
      context: { brandId: 'brand-1' },
    });
  });

  it('refines text through the catalog with only the draft, platform, mode, brand and request key', async () => {
    const data = {
      hasBrandVoice: true,
      isReplayed: false,
      maxCharacters: 280,
      mode: 'rewrite',
      platform: 'twitter',
      text: 'Rewritten',
    };
    post.mockResolvedValue({ data: { creditsUsed: 2, data, success: true } });

    await expect(
      new AgentToolsService('token').refineText({
        mode: 'rewrite',
        platform: 'twitter',
        requestKey: 'key-1',
        text: 'Draft',
      }),
    ).resolves.toEqual(data);
    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/agent-tools/refine_text/execute',
      {
        parameters: {
          brandId: 'brand-1',
          mode: 'rewrite',
          platform: 'twitter',
          requestKey: 'key-1',
          text: 'Draft',
        },
        context: { brandId: 'brand-1' },
      },
    );
  });

  it.each([[{ hasBrandVoice: true, text: '  ' }], [{ text: 'No flag' }], [{}]])(
    'rejects a malformed text action result',
    async (data) => {
      post.mockResolvedValue({ data: { data, success: true } });
      await expect(
        new AgentToolsService('token').refineText({
          mode: 'proofread',
          platform: 'twitter',
          requestKey: 'key-2',
          text: 'Draft',
        }),
      ).rejects.toThrow('No text returned');
    },
  );

  it('surfaces a stopped text action instead of a result', async () => {
    post.mockResolvedValue({
      data: {
        error: 'This request is already running.',
        success: false,
      },
    });
    await expect(
      new AgentToolsService('token').refineText({
        mode: 'rewrite',
        platform: 'twitter',
        requestKey: 'key-3',
        text: 'Draft',
      }),
    ).rejects.toThrow('already running');
  });

  it('drafts reply options through the catalog with the source post, platform, tone and key', async () => {
    const data = {
      hasBrandVoice: true,
      isReplayed: false,
      maxCharacters: 280,
      platform: 'twitter',
      tone: 'agree',
      variants: ['One', 'Two'],
    };
    post.mockResolvedValue({ data: { creditsUsed: 2, data, success: true } });

    await expect(
      new AgentToolsService('token').generateReplyVariants({
        platform: 'twitter',
        postAuthor: '@ada',
        postContent: 'We launched.',
        requestKey: 'key-4',
        tone: 'agree',
      }),
    ).resolves.toEqual(data);
    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/agent-tools/generate_reply_variants/execute',
      {
        parameters: {
          brandId: 'brand-1',
          platform: 'twitter',
          postAuthor: '@ada',
          postContent: 'We launched.',
          requestKey: 'key-4',
          tone: 'agree',
          variants: undefined,
        },
        context: { brandId: 'brand-1' },
      },
    );
  });

  it('leaves out a blank author', async () => {
    post.mockResolvedValue({
      data: {
        data: { hasBrandVoice: false, variants: ['One'] },
        success: true,
      },
    });

    await new AgentToolsService('token').generateReplyVariants({
      platform: 'reddit',
      postAuthor: '',
      postContent: 'A post',
      requestKey: 'key-5',
      tone: 'funny',
      variants: 2,
    });

    expect(post.mock.calls[0][1].parameters).toMatchObject({
      postAuthor: undefined,
      variants: 2,
    });
  });

  it.each([
    [{ hasBrandVoice: true, variants: [] }],
    [{ hasBrandVoice: true, variants: ['  '] }],
    [{ hasBrandVoice: true, variants: [1] }],
    [{ variants: ['One'] }],
    [{}],
  ])('rejects a malformed reply options result', async (data) => {
    post.mockResolvedValue({ data: { data, success: true } });
    await expect(
      new AgentToolsService('token').generateReplyVariants({
        platform: 'twitter',
        postContent: 'A post',
        requestKey: 'key-6',
        tone: 'agree',
      }),
    ).rejects.toThrow('No replies returned');
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
      'brand-1',
    );
    expect(get).toHaveBeenCalledWith('/credentials', {
      params: { brandId: 'brand-1', limit: 100 },
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
          'brand-1',
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
        'brand-1',
      ),
    ).rejects.toThrow('Account is unavailable');
  });

  it.each([
    [
      'a credit limit',
      {
        creditsUsed: 0,
        data: { code: 'insufficient_credits' },
        error: 'Not enough credits to generate content.',
        success: false,
      },
      'insufficient_credits',
    ],
    [
      'a provider outage',
      {
        creditsUsed: 0,
        data: { code: 'provider_unavailable' },
        error: 'The text provider is unavailable.',
        success: false,
      },
      'provider_unavailable',
    ],
    [
      'a failure without a code',
      { error: 'A brand is required to edit text.', success: false },
      null,
    ],
    [
      'an approval requirement',
      { requiresConfirmation: true, success: true },
      'approval_required',
    ],
  ])('keeps the reason code of %s', async (_label, data, code) => {
    post.mockResolvedValue({ data });

    const failure = await new AgentToolsService('token')
      .execute('refine', { mode: 'rewrite', text: 'Draft' })
      .catch((error) => error);

    expect(failure).toBeInstanceOf(AgentActionError);
    expect(failure.code).toBe(code);
    expect(failure.message).toBeTruthy();
  });
});

vi.mock('~services/workspace.service', () => ({
  requireWorkspace: async () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    revision: 1,
  }),
  assertWorkspace: vi.fn(),
}));
