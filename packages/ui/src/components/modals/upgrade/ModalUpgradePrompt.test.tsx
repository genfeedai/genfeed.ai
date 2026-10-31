import { ModalEnum, QualityTier, SubscriptionTier } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalUpgradePrompt from '@ui/modals/upgrade/ModalUpgradePrompt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      ui: {
        creditsRequiredPrompt: {
          body: 'Everything you already made stays in your Library. Buy a credit pack or pick a plan to keep creating.',
          buyCredits: 'Buy credits',
          heading: 'This needs more credits than you have left',
          seePlans: 'See plans',
          title: 'Not enough credits',
        },
        upgradePrompt: {
          notNow: 'Not now',
          perMonth: '/mo',
          quality: '{quality} quality',
          recommended: 'Recommended',
          redirecting: 'Redirecting…',
          title: '{quality} quality is on {plan}',
          titleFallback: 'Upgrade your plan',
          upgradeTo: 'Upgrade to {plan}',
          yourPlan: 'Your plan',
        },
      },
    }),
  };
});

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({
    children,
    id,
    title,
  }: import('react').ComponentProps<
    typeof import('@ui/modals/modal/Modal').default
  >) => (
    <div data-testid={id}>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme/~${path}` }),
}));

const mockPlans = vi.hoisted(() => ({
  pro: 'price_pro' as string | undefined,
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.test' }, plans: mockPlans },
}));

describe('ModalUpgradePrompt', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mockPlans.pro = 'price_pro';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('offers a credit pack and the plans from the credits prompt', () => {
    render(<ModalUpgradePrompt reason="credits" />);

    const prompt = screen.getByTestId(ModalEnum.CREDITS_REQUIRED);
    expect(prompt).toHaveTextContent('Not enough credits');
    expect(prompt).toHaveTextContent('stays in your Library');

    fireEvent.click(screen.getByRole('button', { name: /Buy credits/ }));
    expect(window.location.href).toBe(
      'https://app.test/acme/~/settings/credits',
    );
  });

  it('links the credits prompt to the plans page', () => {
    render(<ModalUpgradePrompt reason="credits" />);

    fireEvent.click(screen.getByRole('button', { name: 'See plans' }));
    expect(window.location.href).toBe(
      'https://app.test/acme/~/settings/subscription',
    );
  });

  it('keeps the plan upgrade prompt as the default', () => {
    render(<ModalUpgradePrompt />);

    expect(screen.getByTestId(ModalEnum.UPGRADE_PROMPT)).toHaveTextContent(
      'Upgrade your plan',
    );
    expect(screen.queryByTestId(ModalEnum.CREDITS_REQUIRED)).toBeNull();
  });

  it('treats an unknown persisted tier as the free plan instead of crashing', () => {
    render(<ModalUpgradePrompt currentTier="starter" />);

    const prompt = screen.getByTestId(ModalEnum.UPGRADE_PROMPT);
    expect(prompt).toHaveTextContent('Your plan');
    expect(prompt).toHaveTextContent('Recommended');
  });

  it('names the locked quality and the plan that unlocks it', () => {
    render(
      <ModalUpgradePrompt
        currentTier={SubscriptionTier.FREE}
        lockedQualityTier={QualityTier.HIGH}
      />,
    );

    const prompt = screen.getByTestId(ModalEnum.UPGRADE_PROMPT);
    expect(prompt).toHaveTextContent('Premium quality is on Pro');
    expect(prompt).toHaveTextContent('Your plan');
    expect(prompt).toHaveTextContent('Recommended');
    expect(prompt).toHaveTextContent('$49/mo');
  });

  it('points to Scale for a quality Pro would unlock while Pro checkout is not configured', () => {
    mockPlans.pro = undefined;

    render(
      <ModalUpgradePrompt
        currentTier={SubscriptionTier.FREE}
        lockedQualityTier={QualityTier.HIGH}
      />,
    );

    const prompt = screen.getByTestId(ModalEnum.UPGRADE_PROMPT);
    expect(prompt).toHaveTextContent('Premium quality is on Scale');
    expect(prompt).toHaveTextContent('$499/mo');
  });

  it('sends the user to the subscription page from the upgrade action', () => {
    render(<ModalUpgradePrompt lockedQualityTier={QualityTier.ULTRA} />);

    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Scale/ }));
    expect(window.location.href).toBe(
      'https://app.test/acme/~/settings/subscription',
    );
  });
});
