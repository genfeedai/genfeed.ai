import { AgentGenerationSettingsToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-settings-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { describe, expect, it, vi } from 'vitest';

const ctx = {
  organizationId: 'trusted-org',
  userId: 'user',
  brandId: 'thread-brand',
} as ToolExecutionContext;
function setup() {
  const settings = {
    get: vi.fn().mockResolvedValue({ isEnabled: true }),
    set: vi.fn().mockResolvedValue({ isEnabled: false }),
  };
  const enhancement = {
    enhance: vi.fn().mockResolvedValue({
      status: 'applied',
      enhancedPrompt: 'Enhanced prompt',
    }),
  };
  return {
    settings,
    handler: new AgentGenerationSettingsToolHandler(
      settings as never,
      enhancement as never,
    ),
    enhancement,
  };
}

describe('AgentGenerationSettingsToolHandler', () => {
  it('previews through the shared enhancer using only authenticated scope', async () => {
    const { handler, enhancement } = setup();
    expect(handler.handles('enhance_prompt')).toBe(true);
    const result = await handler.execute(
      'enhance_prompt',
      {
        prompt: 'A bicycle',
        contentType: 'image',
        harness: true,
        organizationId: 'foreign',
      },
      ctx,
    );
    expect(enhancement.enhance).toHaveBeenCalledWith({
      organizationId: 'trusted-org',
      brandId: 'thread-brand',
      prompt: 'A bicycle',
      contentType: 'image',
      harness: true,
      model: undefined,
    });
    expect(result).toMatchObject({
      success: true,
      creditsUsed: 1,
      isBillingDelegated: false,
      data: {
        prompt: 'Enhanced prompt',
        generationHarness: { status: 'applied' },
      },
    });
  });

  it('bypasses catalog billing when the preview skips enhancement', async () => {
    const { handler, enhancement } = setup();
    enhancement.enhance.mockResolvedValue({
      status: 'skipped',
      enhancedPrompt: 'A bicycle',
    });
    expect(
      await handler.enhance(
        { prompt: 'A bicycle', contentType: 'image', harness: false },
        ctx,
      ),
    ).toMatchObject({
      success: true,
      creditsUsed: 0,
      isBillingDelegated: true,
    });
  });

  it.each([
    { prompt: '', contentType: 'image' },
    { prompt: 'A bicycle', contentType: 'audio' },
    { prompt: 'A bicycle', contentType: 'image', harness: 'false' },
  ])(
    'rejects invalid preview inputs without calling the enhancer',
    async (params) => {
      const { handler, enhancement } = setup();
      await expect(handler.enhance(params, ctx)).rejects.toThrow();
      expect(enhancement.enhance).not.toHaveBeenCalled();
    },
  );

  it('reads only in the authenticated tenant and uses thread brand context', async () => {
    const { handler, settings } = setup();
    expect(await handler.get({ organizationId: 'foreign' }, ctx)).toMatchObject(
      { success: true, creditsUsed: 0 },
    );
    expect(settings.get).toHaveBeenCalledWith('trusted-org', 'thread-brand');
  });

  it('writes only in the authenticated tenant with an explicit override/reset', async () => {
    const { handler, settings } = setup();
    await handler.set(
      {
        organizationId: 'foreign',
        scope: 'brand',
        brandId: 'explicit-brand',
        isEnabled: null,
      },
      ctx,
    );
    expect(settings.set).toHaveBeenCalledWith('trusted-org', {
      scope: 'brand',
      brandId: 'explicit-brand',
      isEnabled: null,
    });
  });

  it.each(['false', 1, undefined])(
    'rejects an invalid boolean before settings mutation',
    async (isEnabled) => {
      const { handler, settings } = setup();
      await expect(
        handler.set({ scope: 'organization', isEnabled }, ctx),
      ).rejects.toThrow('boolean');
      expect(settings.set).not.toHaveBeenCalled();
    },
  );
});
