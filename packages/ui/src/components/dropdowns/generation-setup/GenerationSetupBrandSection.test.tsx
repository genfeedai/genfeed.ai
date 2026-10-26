import '@testing-library/jest-dom/vitest';
import { RouterPriority } from '@genfeedai/contracts';
import type {
  GenerationSetup,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { StudioPlaygroundCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupBrandSection from '@ui/dropdowns/generation-setup/GenerationSetupBrandSection';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/data/generation/use-generation-harness-settings', () => ({
  useGenerationHarnessSettings: () => ({
    brandId: 'brand-1',
    error: null,
    isLoading: false,
    isSaving: false,
    refresh: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    settings: {
      brandEnabled: null,
      brandId: 'brand-1',
      isEnabled: true,
      organizationEnabled: true,
      source: 'organization',
    },
  }),
}));

const CAPABILITIES: StudioPlaygroundCapabilities = {
  hasAspectRatio: true,
  hasBrandEnrichment: true,
  hasDuration: false,
  hasIdentity: false,
  hasInstrumentalToggle: false,
  hasLook: true,
  hasLyrics: false,
  hasModelSelection: true,
  hasOutputs: true,
  hasReferences: true,
  hasSpeech: false,
  hasStyle: false,
};

function buildSetup(
  brandingMode: GenerationSetupValues['brandingMode'],
  sources: GenerationSetup['sources'] = {},
): GenerationSetup {
  return {
    sources,
    values: {
      aspectRatio: '1:1',
      brandingMode,
      duration: 5,
      instrumental: false,
      isPromptEnhanceEnabled: true,
      lyrics: '',
      modelKey: 'model',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      style: '',
      type: 'image',
    },
  };
}

function renderSection(setup: GenerationSetup) {
  const onResetField = vi.fn();
  const onSetField = vi.fn();
  render(
    <GenerationSetupBrandSection
      capabilities={CAPABILITIES}
      onResetField={onResetField}
      onSetField={onSetField}
      reasons={{}}
      setup={setup}
    />,
  );
  return {
    brandVoice: screen.getByRole('switch', { name: 'Brand voice' }),
    onResetField,
    onSetField,
  };
}

describe('GenerationSetupBrandSection', () => {
  it('shows brand voice as one switch with no heading or enhancement defaults', () => {
    const { brandVoice } = renderSection(buildSetup('brand'));

    expect(brandVoice).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Inherit' })).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/prompt enhancement/i)).toBeNull();
  });

  it('turns brand voice off and on explicitly', () => {
    const { brandVoice, onSetField } = renderSection(
      buildSetup('off', { brandingMode: 'user' }),
    );

    expect(brandVoice).not.toBeChecked();
    fireEvent.click(brandVoice);
    expect(onSetField).toHaveBeenCalledWith('brandingMode', 'brand');
  });

  it('keeps the enhancement defaults, with no heading, when the surface offers them', () => {
    render(
      <GenerationSetupBrandSection
        capabilities={CAPABILITIES}
        onResetField={vi.fn()}
        onSetField={vi.fn()}
        reasons={{}}
        setup={buildSetup('brand')}
        showEnhancementSettings
      />,
    );

    expect(screen.getByRole('switch', { name: 'Brand voice' })).toBeChecked();
    expect(
      screen.getByRole('group', { name: 'Organization prompt enhancement' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Brand prompt enhancement' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('Prompt enhancement')).toBeNull();
  });

  it('renders nothing when the output type has no brand enrichment', () => {
    const { container } = render(
      <GenerationSetupBrandSection
        capabilities={{ ...CAPABILITIES, hasBrandEnrichment: false }}
        onResetField={vi.fn()}
        onSetField={vi.fn()}
        reasons={{}}
        setup={buildSetup('brand')}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
