import '@testing-library/jest-dom/vitest';
import { RouterPriority } from '@genfeedai/contracts';
import type {
  GenerationSetup,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { StudioPlaygroundCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { fireEvent, render, screen, within } from '@testing-library/react';
import GenerationSetupBrandSection from '@ui/dropdowns/generation-setup/GenerationSetupBrandSection';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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
    group: within(screen.getByRole('group', { name: 'Brand voice' })),
    onResetField,
    onSetField,
  };
}

describe('GenerationSetupBrandSection', () => {
  it('selects Inherit while the agent owns brand voice', () => {
    const { group } = renderSection(buildSetup('brand'));
    expect(group.getByRole('button', { name: 'Inherit' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sets On and Off explicitly and resets back to the agent on Inherit', () => {
    const { group, onResetField, onSetField } = renderSection(
      buildSetup('brand', { brandingMode: 'user' }),
    );
    expect(group.getByRole('button', { name: 'On' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(group.getByRole('button', { name: 'Off' }));
    expect(onSetField).toHaveBeenCalledWith('brandingMode', 'off');
    fireEvent.click(group.getByRole('button', { name: 'Inherit' }));
    expect(onResetField).toHaveBeenCalledWith('brandingMode');
  });
});
