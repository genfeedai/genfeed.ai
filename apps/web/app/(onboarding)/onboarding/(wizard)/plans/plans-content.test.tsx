// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlansContent from './plans-content';

const mocks = vi.hoisted(() => ({
  access: {
    accessState: null as null | { trialEndsAt: string | null },
    isLoading: false,
    isSuperAdmin: false,
  },
  openCheckout: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@providers/access-state/access-state.provider', () => ({
  AccessStateProvider: ({ children }: { children: ReactNode }) => children,
  useAccessState: () => mocks.access,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: [],
    selectedBrand: { organization: { slug: 'acme' }, slug: 'main' },
  }),
}));

vi.mock(
  '@/hooks/data/subscription/use-start-checkout/use-start-checkout',
  () => ({ useStartCheckout: () => mocks.openCheckout }),
);

vi.mock('@genfeedai/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/pricing')>();
  return {
    ...actual,
    getPlanByTier: (tier: Parameters<typeof actual.getPlanByTier>[0]) => ({
      ...actual.getPlanByTier(tier),
      stripePriceId: `price_${tier}`,
    }),
  };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { website: 'https://genfeed.ai' },
    plans: { payg: 'price_payg' },
  },
}));

describe('PlansContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openCheckout.mockResolvedValue(undefined);
    mocks.access = {
      accessState: { trialEndsAt: '2026-11-30T10:00:00.000Z' },
      isLoading: false,
      isSuperAdmin: false,
    };
  });

  it('offers Pro, Scale and Credits only to an organization that never paid', () => {
    render(<PlansContent />);

    expect(
      screen.getByRole('heading', {
        name: 'Your first posts are ready. Pick a plan to publish them.',
      }),
    ).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Pro/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Scale/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Credits only/ })).toBeVisible();
    expect(screen.getByText('$10 to start')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Read my drafts first' }),
    ).toHaveAttribute('href', '/acme/main/publishing/posts?status=draft');
  });

  it('opens Stripe Checkout for the starter credit pack', async () => {
    render(<PlansContent />);

    fireEvent.click(screen.getByRole('radio', { name: /Credits only/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Credits only' }),
    );

    await waitFor(() =>
      expect(mocks.openCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 1000,
          stripePriceId: 'price_payg',
        }),
      ),
    );
  });

  it('opens Stripe Checkout for Pro as one plan seat', async () => {
    render(<PlansContent />);

    fireEvent.click(screen.getByRole('button', { name: /^Continue with Pro/ }));

    await waitFor(() =>
      expect(mocks.openCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: null,
          stripePriceId: 'price_pro',
        }),
      ),
    );
  });

  it('shows a paid organization the way into its workspace instead', () => {
    mocks.access.accessState = { trialEndsAt: null };
    render(<PlansContent />);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open my workspace' }),
    ).toHaveAttribute('href', '/acme/main/publishing/posts?status=draft');
  });
});
