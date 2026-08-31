import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentTeamHireRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('ContentTeamHireRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the agent library on the canonical Agents surface', async () => {
    await ContentTeamHireRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/automation/agents?add=library',
    );
  });
});
