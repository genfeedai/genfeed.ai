import { ModalEnum } from '@genfeedai/contracts';
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

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.test' } },
}));

describe('ModalUpgradePrompt', () => {
  const originalLocation = window.location;

  beforeEach(() => {
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
      'Upgrade Your Plan',
    );
    expect(screen.queryByTestId(ModalEnum.CREDITS_REQUIRED)).toBeNull();
  });
});
