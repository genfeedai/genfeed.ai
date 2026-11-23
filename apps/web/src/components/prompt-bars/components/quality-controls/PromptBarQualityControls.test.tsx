import '@testing-library/jest-dom/vitest';
import { ModalEnum, QualityTier, SubscriptionTier } from '@genfeedai/contracts';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PromptBarQualityControls from '@/components/prompt-bars/components/quality-controls/PromptBarQualityControls';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  openModal: vi.fn(),
}));

function renderControls(subscriptionTier: SubscriptionTier) {
  const setValue = vi.fn();
  const triggerConfigChange = vi.fn();

  render(
    <PromptBarQualityControls
      controlClass=""
      form={{ setValue } as never}
      isDisabled={false}
      subscriptionTier={subscriptionTier}
      triggerConfigChange={triggerConfigChange}
      watchedQuality={QualityTier.BASIC}
    />,
  );

  return { setValue, triggerConfigChange };
}

describe('PromptBarQualityControls', () => {
  it('sets an allowed quality and tells the prompt bar', async () => {
    const { setValue, triggerConfigChange } = renderControls(
      SubscriptionTier.PRO,
    );

    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: 'Quality' }));
    await userEvent
      .setup()
      .click(screen.getByRole('option', { name: 'Premium' }));

    expect(setValue).toHaveBeenCalledWith('quality', QualityTier.HIGH, {
      shouldDirty: false,
      shouldValidate: false,
    });
    expect(triggerConfigChange).toHaveBeenCalledTimes(1);
  });

  it('opens the upgrade dialog instead of choosing a quality the plan lacks', async () => {
    const { setValue } = renderControls(SubscriptionTier.FREE);
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Quality' }));
    await user.click(
      screen.getByRole('option', { name: 'Premium, requires a higher plan' }),
    );

    expect(openModal).toHaveBeenCalledWith(ModalEnum.UPGRADE_PROMPT);
    expect(setValue).not.toHaveBeenCalled();
  });
});
