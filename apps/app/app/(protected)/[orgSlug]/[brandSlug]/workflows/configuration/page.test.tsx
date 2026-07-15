import { redirect } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LegacyWorkflowConfigurationPage from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

describe('LegacyWorkflowConfigurationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects exactly once to the scoped canonical capability without loading a workflow id', async () => {
    await expect(
      LegacyWorkflowConfigurationPage({
        params: Promise.resolve({
          brandSlug: 'moonrise',
          orgSlug: 'acme',
        }),
        searchParams: Promise.resolve({
          overlay: 'workflow-picker',
          thread: 'thread-1',
        }),
      }),
    ).rejects.toThrow(
      'redirect:/acme/moonrise/orchestration/configuration?overlay=workflow-picker&thread=thread-1',
    );

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(
      '/acme/moonrise/orchestration/configuration?overlay=workflow-picker&thread=thread-1',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
