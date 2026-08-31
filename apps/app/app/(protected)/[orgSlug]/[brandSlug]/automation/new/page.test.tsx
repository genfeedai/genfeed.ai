import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationNewAgentLegacyRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('AutomationNewAgentLegacyRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens custom creation on the canonical Agents surface', async () => {
    await AutomationNewAgentLegacyRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/automation/agents?add=custom',
    );
  });
});
