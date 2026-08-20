import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LegacyAutomateSkillsRoute from './page';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn(),
}));

describe('LegacyAutomateSkillsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to brand Skills settings', async () => {
    await LegacyAutomateSkillsRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/settings/skills',
    );
  });
});
