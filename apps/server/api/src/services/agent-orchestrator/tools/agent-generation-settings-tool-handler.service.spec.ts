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
    enhance: vi
      .fn()
      .mockResolvedValue({
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
