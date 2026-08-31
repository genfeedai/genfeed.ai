import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LegacyAgentConfigurationRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('LegacyAgentConfigurationRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the canonical brand Agent Defaults settings', async () => {
    await LegacyAgentConfigurationRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/settings/agent-defaults',
    );
  });
});
