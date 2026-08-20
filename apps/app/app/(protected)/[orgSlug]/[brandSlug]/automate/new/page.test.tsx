import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AutomateNewAgentLegacyRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('AutomateNewAgentLegacyRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens custom creation on the canonical Agents surface', async () => {
    await AutomateNewAgentLegacyRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/automate/agents?add=custom',
    );
  });
});
