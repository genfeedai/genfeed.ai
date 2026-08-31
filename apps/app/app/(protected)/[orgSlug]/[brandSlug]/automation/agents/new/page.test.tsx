import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationWizardRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('AutomationWizardRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens custom creation on the canonical Agents surface', async () => {
    await AutomationWizardRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/automation/agents?add=custom',
    );
  });
});
