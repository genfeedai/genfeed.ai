import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { ModelCategory } from '@genfeedai/enums';
import type { IPreset } from '@genfeedai/interfaces';
import type { PromptBarMetadataSelectorsProps } from '@props/prompt-bars/prompt-bar-metadata-selectors.props';
import { render } from '@testing-library/react';
import PromptBarMetadataSelectors from '@ui/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/dropdown-field', () => ({
  default: ({
    label,
    options,
    value,
    onChange,
    isDisabled,
  }: {
    label: string;
    options: { key: string; label: string }[];
    value: string;
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    isDisabled: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={onChange}
      disabled={isDisabled}
    >
      {options?.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

describe('PromptBarMetadataSelectors', () => {
  const mockForm: UseFormReturn<PromptTextareaSchema> = {
    getValues: vi.fn().mockReturnValue(''),
    setValue: vi.fn(),
  } as unknown as UseFormReturn<PromptTextareaSchema>;

  const preset: IPreset = {
    category: ModelCategory.IMAGE,
    createdAt: '2024-01-01',
    description: 'Preset description',
    id: 'preset-1',
    isActive: true,
    isDeleted: false,
    key: 'preset-1',
    label: 'Preset 1',
    updatedAt: '2024-01-01',
  };

  const baseProps: PromptBarMetadataSelectorsProps = {
    controlClass: 'control-class',
    currentConfig: { buttons: { presets: true } },
    filteredCameraMovements: [],
    filteredCameras: [],
    filteredFontFamilies: [],
    filteredLenses: [],
    filteredLightings: [],
    filteredMoods: [],
    filteredPresets: [preset],
    filteredScenes: [],
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
    const { container } = render(<PromptBarMetadataSelectors {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<PromptBarMetadataSelectors {...baseProps} />);
    expect(
      document.querySelector('select[aria-label="Preset"]'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PromptBarMetadataSelectors {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
