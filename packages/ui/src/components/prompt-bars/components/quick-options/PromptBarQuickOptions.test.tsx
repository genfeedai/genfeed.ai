import '@testing-library/jest-dom/vitest';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientCategory, IngredientFormat } from '@genfeedai/contracts';
import type { PromptBarQuickOptionsProps } from '@genfeedai/props/prompt-bars/prompt-bar-tiers.props';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarQuickOptions from '@ui/prompt-bars/components/quick-options/PromptBarQuickOptions';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

function makeForm(
  values: Partial<PromptTextareaSchema> = {},
): UseFormReturn<PromptTextareaSchema> {
  return {
    getValues: vi.fn((key?: string) =>
      key ? (values as Record<string, unknown>)[key] : values,
    ),
    setValue: vi.fn(),
  } as unknown as UseFormReturn<PromptTextareaSchema>;
}

function makeProps(
  overrides: Partial<PromptBarQuickOptionsProps> = {},
): PromptBarQuickOptionsProps {
  return {
    categoryType: IngredientCategory.VIDEO,
    controlClass: 'control',
    currentConfig: { buttons: {} },
    currentModelCategory: null,
    endFrame: null,
    form: makeForm(),
    hasAnyImagenModelValue: false,
    hasAnyResolutionOptionsValue: false,
    hasAudioToggleValue: true,
    hasEndFrameValue: false,
    iconButtonClass: 'icon-button',
    isAdvancedControlsEnabled: true,
    isDisabledState: false,
    isExpanded: true,
    isOnlyImagenModelsValue: false,
    maxReferenceCount: 1,
    normalizedWatchedModels: [],
    openGallery: vi.fn(),
    openUpload: vi.fn(),
    pathname: '/studio',
    references: [],
    referenceSource: '',
    requiresReferences: false,
    setEndFrame: vi.fn(),
    setReferences: vi.fn(),
    setReferenceSource: vi.fn(),
    supportsInterpolation: false,
    supportsMultipleReferences: false,
    triggerConfigChange: vi.fn(),
    watchedFormat: IngredientFormat.LANDSCAPE,
    watchedHeight: 1080,
    watchedWidth: 1920,
    ...overrides,
  };
}

describe('PromptBarQuickOptions', () => {
  // Background music moved to the Studio editor (#4683) — video generation
  // no longer offers it as a quick option, on a video row or anywhere else.
  it('never renders a background-music toggle or panel', () => {
    render(<PromptBarQuickOptions {...makeProps()} />);

    expect(screen.queryByText('Background Music')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('background-music-toggle'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Music Source')).not.toBeInTheDocument();
    expect(screen.queryByText('Volume')).not.toBeInTheDocument();
    expect(screen.queryByText('Mute original audio')).not.toBeInTheDocument();
  });

  it('still renders the audio toggle, unaffected by the music removal', () => {
    render(<PromptBarQuickOptions {...makeProps()} />);

    expect(screen.getByTestId('audio-toggle')).toBeInTheDocument();
  });

  it('toggles isAudioEnabled without touching any music field', () => {
    const form = makeForm();
    render(<PromptBarQuickOptions {...makeProps({ form })} />);

    fireEvent.click(screen.getByTestId('audio-toggle'));

    expect(form.setValue).toHaveBeenCalledWith(
      'isAudioEnabled',
      expect.any(Boolean),
      { shouldValidate: true },
    );
    expect(form.setValue).not.toHaveBeenCalledWith(
      expect.stringContaining('music'),
      expect.anything(),
      expect.anything(),
    );
    expect(form.setValue).not.toHaveBeenCalledWith(
      expect.stringContaining('Music'),
      expect.anything(),
      expect.anything(),
    );
  });
});
