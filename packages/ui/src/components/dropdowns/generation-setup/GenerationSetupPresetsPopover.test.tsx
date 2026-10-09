import { RouterPriority } from '@genfeedai/contracts';
import { STUDIO_SYSTEM_PRESETS } from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { GenerationSetupPresetsPopoverProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupPresetsPopover from '@ui/dropdowns/generation-setup/GenerationSetupPresetsPopover';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const props: GenerationSetupPresetsPopoverProps = {
  onApplyPreset: vi.fn(),
  onClearPreset: vi.fn(),
  onSavePreset: vi.fn(),
  presets: [],
  setup: {
    sources: {},
    values: {
      type: 'image',
      aspectRatio: '1:1',
      modelKey: '',
      isPromptEnhanceEnabled: false,
      outputs: 1,
      brandingMode: 'off',
      prioritize: RouterPriority.BALANCED,
    },
  },
};

describe('GenerationSetupPresetsPopover', () => {
  it('previews a system template before applying it and never offers system deletion', async () => {
    const user = userEvent.setup();
    const onApplySystemPreset = vi.fn();
    render(
      <GenerationSetupPresetsPopover
        {...props}
        systemPresets={STUDIO_SYSTEM_PRESETS.filter((p) => p.type === 'image')}
        onApplySystemPreset={onApplySystemPreset}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    await user.click(
      screen.getByRole('button', { name: 'YouTube thumbnail', exact: true }),
    );
    expect(onApplySystemPreset).not.toHaveBeenCalled();
    expect(
      screen.getByRole('img', {
        name: 'YouTube thumbnail illustrative template preview',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete preset YouTube thumbnail' }),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Apply preset YouTube thumbnail' }),
    );
    expect(onApplySystemPreset).toHaveBeenCalledWith(STUDIO_SYSTEM_PRESETS[2]);
    expect(screen.queryByPlaceholderText('Search presets…')).toBeNull();
  });
  it('opens presets directly with an honest empty state and keeps save controls', async () => {
    const user = userEvent.setup();
    render(<GenerationSetupPresetsPopover {...props} />);
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    expect(screen.getByText('No saved presets yet.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search presets…')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Save as preset…'), 'My look');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSavePreset).toHaveBeenCalledWith('My look');
  });
  it('disables the direct entry during generation', () => {
    render(<GenerationSetupPresetsPopover {...props} isDisabled />);
    expect(screen.getByRole('button', { name: 'Presets' })).toBeDisabled();
  });
});
