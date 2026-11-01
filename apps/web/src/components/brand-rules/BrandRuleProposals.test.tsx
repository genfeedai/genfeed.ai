import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandRuleProposals from '@/components/brand-rules/BrandRuleProposals';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  proposeRules: vi.fn(),
  saveRules: vi.fn(),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    proposeRules: mocks.proposeRules,
    saveRules: mocks.saveRules,
  }),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: mocks.error }) },
}));
vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { default: ui } = await import('../../../messages/en/ui.json');
  return { useTranslations: createTranslateFromCatalog({ ui }) };
});

const SLOW = { timeout: 3000 };

describe('BrandRuleProposals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.proposeRules.mockResolvedValue(['Never use "truly".']);
    mocks.saveRules.mockResolvedValue({
      added: ['Never use "truly".'],
      guardrails: ['Never use "truly".'],
      profileId: 'profile-1',
    });
  });

  it('offers the edit as a rule and saves it when the user accepts', async () => {
    const user = userEvent.setup();
    render(
      <BrandRuleProposals
        original="The editor is truly live."
        edited="The editor is live."
      />,
    );

    expect(
      await screen.findByText('Never use "truly".', undefined, SLOW),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Saved to your content rules: Never use "truly".',
      ),
    );
    expect(mocks.saveRules).toHaveBeenCalledWith({
      brandId: 'brand-1',
      rules: ['Never use "truly".'],
    });
    expect(screen.queryByRole('button', { name: 'Save rule' })).toBeNull();
  });

  it('saves nothing when the user dismisses the suggestion', async () => {
    const user = userEvent.setup();
    render(
      <BrandRuleProposals
        original="The editor is truly live."
        edited="The editor is live."
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Dismiss' }, SLOW),
    );

    expect(screen.queryByText('Never use "truly".')).toBeNull();
    expect(mocks.saveRules).not.toHaveBeenCalled();
  });

  it('offers a rejection reason as a rule without needing an edit', async () => {
    mocks.proposeRules.mockResolvedValue(['Too salesy.']);
    render(<BrandRuleProposals reason="Too salesy" />);

    expect(
      await screen.findByText('Too salesy.', undefined, SLOW),
    ).toBeTruthy();
    expect(mocks.proposeRules).toHaveBeenCalledWith(
      { brandId: 'brand-1', reason: 'Too salesy' },
      expect.anything(),
    );
  });

  it('suggests nothing for a blank reason', async () => {
    render(<BrandRuleProposals reason="   " />);

    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(mocks.proposeRules).not.toHaveBeenCalled();
  });

  it('suggests nothing while the text is as the model wrote it', async () => {
    render(
      <BrandRuleProposals
        original="The editor is truly live."
        edited="The editor is truly live."
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(screen.queryByRole('button', { name: 'Save rule' })).toBeNull();
    expect(mocks.proposeRules).not.toHaveBeenCalled();
  });

  it('suggests nothing for a post that was not generated here', async () => {
    render(<BrandRuleProposals original={null} edited="Typed by hand." />);

    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(screen.queryByRole('button', { name: 'Save rule' })).toBeNull();
    expect(mocks.proposeRules).not.toHaveBeenCalled();
  });

  it('keeps the suggestion and says so when saving fails', async () => {
    mocks.saveRules.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(
      <BrandRuleProposals
        original="The editor is truly live."
        edited="The editor is live."
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Save rule' }, SLOW),
    );

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'Could not save the rule. Please try again.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Save rule' })).toBeTruthy();
  });
});
