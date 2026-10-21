import '@testing-library/jest-dom/vitest';
import { RouterPriority } from '@genfeedai/contracts';
import type { GenerationSetupSectionChipsProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupSectionChips from '@ui/dropdowns/generation-setup/GenerationSetupSectionChips';
import { describe, expect, it, vi } from 'vitest';

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
  onClearPreset: vi.fn(),
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
    render(<GenerationSetupSectionChips {...props} showPresets />);

    expect(
      screen.getByRole('button', { name: 'Configure Model' }),
    ).toHaveTextContent('Balanced');
    const outputChip = screen.getByRole('button', {
      name: 'Configure Output',
    });
    expect(outputChip).toHaveTextContent('x2');
    expect(screen.queryByRole('button', { name: 'Configure Look' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Configure Presets' }));
    const presetsPanel = screen.getByRole('dialog', { name: 'Presets' });
    expect(presetsPanel).toBeInTheDocument();
    // A panel opened from a chip has no back button: the chip is the way in.
    expect(screen.queryByRole('button', { name: 'Back to setup' })).toBeNull();

    // Opening another chip closes the one that was open.
    fireEvent.keyDown(outputChip, { key: 'Enter' });
    expect(screen.queryByRole('dialog', { name: 'Presets' })).toBeNull();
    expect(
      screen.getByRole('menuitem', { name: /Aspect ratio/ }),
    ).toBeInTheDocument();
  });

  it('ends the row with the trailing slot, after the last chip', () => {
    render(
      <GenerationSetupSectionChips
        {...props}
        trailing={<span data-testid="end-of-row" />}
      />,
    );

    const row = screen.getByTestId('generation-setup-section-chips');
    const end = screen.getByTestId('end-of-row');
    expect(
      row.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(row).not.toContainElement(end);
  });

  it('keeps the labels in the tooltip, and folds the chips into a More setup menu', () => {
    render(<GenerationSetupSectionChips {...props} showPresets />);

    // Width decides what shows (container queries); both ways in are always
    // in the tree, and the chip's label stays in its tooltip.
    const outputChip = screen.getByRole('button', {
      name: 'Configure Output',
    });
    expect(outputChip.getAttribute('title')).toContain('Output');

    fireEvent.keyDown(screen.getByRole('button', { name: 'More setup' }), {
      key: 'Enter',
    });
    expect(screen.getByRole('menuitem', { name: /Model/ })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Output/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Presets/ }),
    ).toBeInTheDocument();
  });

  it('offers Reset to defaults at the top of the Presets panel', () => {
    const onResetAll = vi.fn();
    render(
      <GenerationSetupSectionChips
        {...props}
        onResetAll={onResetAll}
        showPresets
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Configure Presets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onResetAll).toHaveBeenCalledTimes(1);
  });
});
