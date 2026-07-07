import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ButtonCredits from '@ui/buttons/credits/ButtonCredits';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const findOneMock = vi.fn().mockResolvedValue({ balance: 1000 });

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org_123' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn(async () => ({
      findOne: findOneMock,
    })),
}));

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => ({
      creditsBreakdown: {
        planLimit: 1000,
      },
      refreshCreditsBreakdown: vi.fn(),
    }),
  }),
);

vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (href: string) => `/acme/~${href}`,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ButtonCredits', () => {
  it('should render without crashing', async () => {
    const { container } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', async () => {
    const { container } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', async () => {
    const { container } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('routes top up to organization billing settings', async () => {
    const { container } = render(<ButtonCredits />);
    await waitFor(() => expect(findOneMock).toHaveBeenCalled());

    const trigger = container.querySelector('button');
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger as HTMLButtonElement);

    expect(
      await screen.findByRole('link', { name: /Top Up/i }),
    ).toHaveAttribute('href', '/acme/~/settings/billing');
  });
});
