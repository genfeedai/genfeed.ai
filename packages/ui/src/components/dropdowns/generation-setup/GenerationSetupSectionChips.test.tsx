import '@testing-library/jest-dom/vitest';
import { RouterPriority } from '@genfeedai/contracts';
import type { GenerationSetupSectionChipsProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupSectionChips from '@ui/dropdowns/generation-setup/GenerationSetupSectionChips';
import { describe, expect, it, vi } from 'vitest';

const fitMocks = vi.hoisted(() => ({ isCompact: false }));

vi.mock(
  '@hooks/prompt-bar/use-prompt-bar-row-fit/use-prompt-bar-row-fit',
  () => ({
    usePromptBarRowFit: () => ({ isCompact: fitMocks.isCompact }),
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const props: GenerationSetupSectionChipsProps = {
  capabilities: {
    hasAspectRatio: true,
    hasBrandEnrichment: false,
    hasDuration: false,
    hasIdentity: false,
    hasInstrumentalToggle: false,
    hasLook: false,
    hasLyrics: false,
    hasModelSelection: true,
    hasOutputs: true,
    hasReferences: false,
    hasSpeech: false,
    hasStyle: false,
  },
  favoriteModelKeys: [],
  lookOptions: {},
  models: [],
  onApplyPreset: vi.fn(),
  onFavoriteToggle: vi.fn(),
  onResetField: vi.fn(),
  onSavePreset: vi.fn(),
  onSetField: vi.fn(),
  presets: [],
  reasons: {},
  setup: {
    sources: {},
    values: {
      type: 'image',
      aspectRatio: '1:1',
      modelKey: '',
      isPromptEnhanceEnabled: false,
      outputs: 2,
      brandingMode: 'off',
      prioritize: RouterPriority.BALANCED,
    },
  },
  typeOptions: [{ label: 'Image', value: 'image' }],
};

describe('GenerationSetupSectionChips', () => {
  it('puts each Advanced section on the row and opens only that section', () => {
    fitMocks.isCompact = false;
    render(<GenerationSetupSectionChips {...props} />);

    expect(
      screen.getByRole('button', { name: 'Configure Model' }),
    ).toHaveTextContent('Auto');
    const outputChip = screen.getByRole('button', {
      name: 'Configure Output',
    });
    expect(outputChip).toHaveTextContent('x2');
    expect(screen.queryByRole('button', { name: 'Configure Look' })).toBeNull();

    fireEvent.click(outputChip);
    const panel = screen.getByRole('dialog', { name: 'Output' });
    expect(panel).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to setup' }));
    expect(screen.queryByRole('dialog', { name: 'Output' })).toBeNull();
  });

  it('drops the labels and keeps them in the tooltip when the row is tight', () => {
    fitMocks.isCompact = true;
    render(<GenerationSetupSectionChips {...props} />);

    const outputChip = screen.getByRole('button', {
      name: 'Configure Output',
    });
    expect(outputChip).not.toHaveTextContent('x2');
    expect(outputChip.getAttribute('title')).toContain('Output');
    expect(
      screen.getByTestId('generation-setup-section-chips'),
    ).toHaveAttribute('data-compact', 'true');
  });
});
