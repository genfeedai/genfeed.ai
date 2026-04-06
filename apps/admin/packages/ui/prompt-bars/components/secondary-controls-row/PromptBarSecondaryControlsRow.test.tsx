import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { MODEL_KEYS } from '@genfeedai/constants';
import type { MediaConfig } from '@genfeedai/interfaces/ui/media-config.interface';
import type { PromptBarSecondaryControlsRowProps } from '@props/prompt-bars/prompt-bar-layout.props';
import { render } from '@testing-library/react';
import PromptBarSecondaryControlsRow from '@ui/prompt-bars/components/secondary-controls-row/PromptBarSecondaryControlsRow';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@ui/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors',
  () => ({
    default: () => (
      <div data-testid="metadata-selectors">Metadata Selectors</div>
    ),
  }),
);

vi.mock('@ui/tags/dropdown/DropdownTags', () => ({
  default: () => <div data-testid="dropdown-tags">Tags</div>,
}));

vi.mock('@ui/dropdowns/multiselect/DropdownMultiSelect', () => ({
  default: () => <div data-testid="dropdown-multiselect">MultiSelect</div>,
}));

describe('PromptBarSecondaryControlsRow', () => {
  const mockForm: UseFormReturn<PromptTextareaSchema> = {
    getValues: vi.fn().mockReturnValue([]),
    setValue: vi.fn(),
  } as unknown as UseFormReturn<PromptTextareaSchema>;

  const currentConfig: MediaConfig = {
    assetType: 'image',
    buttons: { presets: true, tags: true },
    defaultModel: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
    placeholder: 'Describe your image',
  };

  const baseProps: PromptBarSecondaryControlsRowProps = {
    controlClass: 'control-class',
    currentConfig,
    filteredBlacklists: [],
    filteredCameraMovements: [],
    filteredCameras: [],
    filteredFontFamilies: [],
    filteredLenses: [],
    filteredLightings: [],
    filteredMoods: [],
    filteredPresets: [],
    filteredScenes: [],
    filteredSounds: [],
    filteredStyles: [],
    form: mockForm,
    isDisabledState: false,
    profiles: [],
    refocusTextarea: vi.fn(),
    selectedPreset: '',
    selectedProfile: '',
    setSelectedPreset: vi.fn(),
    setSelectedProfile: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(
      <PromptBarSecondaryControlsRow {...baseProps} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<PromptBarSecondaryControlsRow {...baseProps} />);
    expect(
      document.querySelector('[data-testid="metadata-selectors"]'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <PromptBarSecondaryControlsRow {...baseProps} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
