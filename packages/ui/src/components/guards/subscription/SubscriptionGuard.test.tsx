// @vitest-environment jsdom
'use client';

import { render, screen, waitFor } from '@testing-library/react';
import SubscriptionGuard from '@ui/guards/subscription/SubscriptionGuard';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const useAccessStateMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => useAccessStateMock(),
  }),
);

describe('SubscriptionGuard deployment-independent license gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
  });

  afterEach(() => {
    delete process.env.GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
  });

  it('allows unlicensed community deployments without subscription state', async () => {
    useAccessStateMock.mockReturnValue({
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
    });

    render(
      <SubscriptionGuard>
        <div>Community content</div>
      </SubscriptionGuard>,
    );

    expect(await screen.findByText('Community content')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects unsubscribed licensed deployments', async () => {
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'license_test';
    useAccessStateMock.mockReturnValue({
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
    });

    render(
      <SubscriptionGuard>
        <div>Licensed content</div>
      </SubscriptionGuard>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/onboarding/providers');
    });
    expect(screen.queryByText('Licensed content')).not.toBeInTheDocument();
  });

  it('allows subscribed licensed deployments', async () => {
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'license_test';
    useAccessStateMock.mockReturnValue({
      isLoading: false,
      isSubscribed: true,
      isSuperAdmin: false,
    });

    render(
      <SubscriptionGuard>
        <div>Licensed content</div>
      </SubscriptionGuard>,
    );

    expect(await screen.findByText('Licensed content')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
