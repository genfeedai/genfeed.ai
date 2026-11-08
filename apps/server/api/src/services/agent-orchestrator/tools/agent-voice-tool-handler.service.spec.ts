import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentVoiceToolHandler } from '@api/services/agent-orchestrator/tools/agent-voice-tool-handler.service';
import { describe, expect, it, vi } from 'vitest';

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

const SAVED_ROWS = [
  {
    externalVoiceId: 'el-1',
    id: 'voice-1',
    label: 'My voice',
    sampleAudioUrl: 'https://cdn.example/voice-1.mp3',
    voiceProvider: 'ELEVENLABS',
    voiceSource: 'imported',
  },
  {
    externalVoiceId: 'el-2',
    id: 'voice-2',
    label: null,
    sampleAudioUrl: null,
    voiceProvider: 'ELEVENLABS',
    voiceSource: 'cloned',
  },
];

function setup(
  overrides: {
    brand?: unknown;
    hasConnection?: boolean;
    page?: unknown;
    rows?: unknown[];
  } = {},
) {
  const accountVoices = {
    browse: vi.fn().mockResolvedValue(
      overrides.page ?? {
        connection: { status: 'connected' },
        hasMore: false,
        nextPageToken: null,
        voices: [],
      },
    ),
    hasPersonalConnection: vi
      .fn()
      .mockResolvedValue(overrides.hasConnection ?? true),
    import: vi.fn().mockResolvedValue({
      externalVoiceId: 'el-9',
      id: 'voice-9',
      label: 'Imported',
      sampleAudioUrl: null,
      voiceProvider: 'ELEVENLABS',
      voiceSource: 'imported',
    }),
  };
  const brands = {
    findOne: vi.fn().mockResolvedValue(
      overrides.brand === undefined
        ? {
            agentConfig: {
              defaultVoiceRef: { internalVoiceId: 'voice-1' },
            },
            id: 'brand-1',
          }
        : overrides.brand,
    ),
    updateAgentConfig: vi.fn().mockResolvedValue({ id: 'brand-1' }),
  };
  const ingredient = {
    findFirst: vi.fn().mockResolvedValue(SAVED_ROWS[0]),
    findMany: vi.fn().mockResolvedValue(overrides.rows ?? SAVED_ROWS),
  };
  const voices = { prisma: { ingredient } };
  return {
    accountVoices,
    brands,
    handler: new AgentVoiceToolHandler(
      accountVoices as never,
      brands as never,
      voices as never,
    ),
    ingredient,
  };
}

describe('AgentVoiceToolHandler', () => {
  it('handles only get_assets with type voice', () => {
    const { handler } = setup();

    expect(handler.handlesList('get_assets', { type: 'voice' })).toBe(true);
    expect(handler.handlesList('get_assets', { type: 'image' })).toBe(false);
    expect(handler.handlesList('generate', { type: 'voice' })).toBe(false);
  });

  it('lists saved voices and marks the brand default', async () => {
    const { handler } = setup();

    const result = await handler.list({ type: 'voice' }, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      count: 2,
      hasConnectedAccount: true,
      source: 'saved',
      voices: [
        {
          id: 'voice-1',
          isBrandDefault: true,
          name: 'My voice',
          previewUrl: 'https://cdn.example/voice-1.mp3',
          source: 'imported',
        },
        { id: 'voice-2', isBrandDefault: false, source: 'cloned' },
      ],
    });
  });

  it('says to connect an account when nothing is saved and none is connected', async () => {
    const { handler } = setup({ hasConnection: false, rows: [] });

    const result = await handler.list({ type: 'voice' }, ctx);

    expect(result.data).toMatchObject({
      count: 0,
      hasConnectedAccount: false,
      hint: expect.stringContaining('No ElevenLabs account is connected'),
    });
  });

  it('browses the connected account and marks voices already saved', async () => {
    const { handler } = setup({
      page: {
        connection: { status: 'connected' },
        hasMore: true,
        nextPageToken: 'next',
        voices: [
          {
            availability: 'available',
            category: 'cloned',
            externalVoiceId: 'el-1',
            name: 'My voice',
            preview: 'https://cdn.example/p.mp3',
            restriction: null,
            savedVoiceId: 'voice-1',
          },
        ],
      },
    });

    const result = await handler.list(
      { q: 'my', source: 'account', type: 'voice' },
      ctx,
    );

    expect(result.data).toEqual({
      connection: { status: 'connected' },
      hasMore: true,
      nextPageToken: 'next',
      source: 'account',
      type: 'voice',
      voices: [
        {
          availability: 'available',
          category: 'cloned',
          externalVoiceId: 'el-1',
          name: 'My voice',
          previewUrl: 'https://cdn.example/p.mp3',
          restriction: null,
          savedVoiceId: 'voice-1',
        },
      ],
    });
  });

  it('reports a disconnected account with a connect hint and no voices', async () => {
    const { handler } = setup({
      page: {
        connection: { status: 'disconnected' },
        hasMore: false,
        nextPageToken: null,
        voices: [],
      },
    });

    const result = await handler.list(
      { source: 'account', type: 'voice' },
      ctx,
    );

    expect(result.data).toMatchObject({
      connection: { status: 'disconnected' },
      hint: expect.stringContaining('connect it there'),
      voices: [],
    });
  });

  it('rejects a paging field that does not apply to the source', async () => {
    const { handler } = setup();

    const result = await handler.list({ pageToken: 'x', type: 'voice' }, ctx);

    expect(result).toMatchObject({
      error: 'pageToken do not apply to type voice with source saved.',
      success: false,
    });
  });

  it('saves a connected-account voice, then makes it the brand default', async () => {
    const { brands, handler } = setup();

    const result = await handler.setBrandDefault(
      {
        defaultVoice: { externalVoiceId: 'el-9' },
        scope: 'brand',
      },
      ctx,
    );

    expect(result.data).toMatchObject({
      brandId: 'brand-1',
      defaultVoice: { id: 'voice-9', isBrandDefault: true, name: 'Imported' },
    });
    expect(brands.updateAgentConfig).toHaveBeenCalledWith('brand-1', 'org-1', {
      defaultVoiceRef: {
        externalVoiceId: 'el-9',
        internalVoiceId: 'voice-9',
        label: 'Imported',
        preview: null,
        provider: 'ELEVENLABS',
        source: 'cloned',
      },
    });
  });

  it('refuses a voice id the organization has not saved', async () => {
    const { brands, handler, ingredient } = setup();
    ingredient.findFirst.mockResolvedValue(null);

    const result = await handler.setBrandDefault(
      { defaultVoice: { voiceId: 'foreign' }, scope: 'brand' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(brands.updateAgentConfig).not.toHaveBeenCalled();
  });

  it('requires exactly one of voiceId or externalVoiceId', async () => {
    const { handler } = setup();

    await expect(
      handler.setBrandDefault(
        {
          defaultVoice: { externalVoiceId: 'el-1', voiceId: 'voice-1' },
          scope: 'brand',
        },
        ctx,
      ),
    ).rejects.toThrow('exactly one of voiceId or externalVoiceId');
  });

  it('refuses an unknown brand', async () => {
    const { handler } = setup({ brand: null });

    const result = await handler.setBrandDefault(
      { defaultVoice: { voiceId: 'voice-1' }, scope: 'brand' },
      ctx,
    );

    expect(result).toMatchObject({
      error: 'Brand was not found in this organization.',
      success: false,
    });
  });
});
