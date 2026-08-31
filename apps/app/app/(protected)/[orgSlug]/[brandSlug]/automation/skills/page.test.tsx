import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LegacyAutomationSkillsRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('LegacyAutomationSkillsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to brand Skills settings', async () => {
    await LegacyAutomationSkillsRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/settings/skills',
    );
  });
});
