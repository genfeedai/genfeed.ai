import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentTeamOrchestratorRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('ContentTeamOrchestratorRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the Creator Studio template on the canonical Programs surface', async () => {
    await ContentTeamOrchestratorRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/automation/campaigns/new?template=creator-studio',
    );
  });
});
