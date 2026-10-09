import { RouterPriority } from '@genfeedai/contracts';
import type { GenerationSetupFrontDoorProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { render, screen } from '@testing-library/react';
import GenerationSetupFrontDoor from '@ui/dropdowns/generation-setup/GenerationSetupFrontDoor';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const props: GenerationSetupFrontDoorProps = {
  capabilities: {
    hasAspectRatio: true,
    hasBrandEnrichment: false,
    hasDuration: false,
    hasIdentity: false,
    hasInstrumentalToggle: false,
    hasLook: false,
    hasLyrics: false,
    hasModelSelection: false,
    hasOutputs: true,
    hasReferences: false,
    hasSpeech: false,
    hasStyle: false,
  },
  lookOptions: {},
  models: [],
  onCustomize: vi.fn(),
  onResetAll: vi.fn(),
  onSetField: vi.fn(),
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
  typeOptions: [{ label: 'Image', value: 'image' }],
};

describe('GenerationSetupFrontDoor', () => {
  it('preserves Agent presets by default and allows Studio to move them outside setup', () => {
    const view = render(<GenerationSetupFrontDoor {...props} />);
    expect(
      screen.getByRole('button', { name: 'Configure Presets' }),
    ).toBeInTheDocument();
    view.rerender(<GenerationSetupFrontDoor {...props} showPresets={false} />);
    expect(
      screen.queryByRole('button', { name: 'Configure Presets' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Configure Output' }),
    ).toBeInTheDocument();
  });
});
