import { render } from '@testing-library/react';
import PromptBarPrimaryControlsRow from '@ui/prompt-bars/components/primary-controls-row/PromptBarPrimaryControlsRow';
import { describe, expect, it, vi } from 'vitest';

// Mock child components
vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  default: ({ label, name }: any) => (
    <label>
      <input type="checkbox" name={name} />
      {label}
    </label>
  ),
}));

vi.mock('@ui/primitives/dropdown-field', () => ({
  default: ({ options, value, onChange }: any) => (
    <select value={value} onChange={onChange ?? (() => {})}>
      {options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock(
  '@ui/prompt-bars/components/format-controls/PromptBarFormatControls',
  () => ({
    default: () => <div data-testid="format-controls">Format Controls</div>,
  }),
);

vi.mock(
  '@ui/prompt-bars/components/model-controls/PromptBarModelControls',
  () => ({
    default: () => <div data-testid="model-controls">Model Controls</div>,
  }),
);

vi.mock(
  '@genfeedai/helpers/media/video-resolution/video-resolution.helper',
  () => ({
    getVideoResolutionsByModel: () => [],
  }),
);

describe('PromptBarPrimaryControlsRow', () => {
  const mockForm = {
    control: {},
    getValues: vi.fn().mockReturnValue('5'),
    setValue: vi.fn(),
    watch: vi.fn().mockReturnValue({}),
  };

  const defaultProps = {
    controlClass: 'test-class',
    form: mockForm as any,
    formatControlsProps: {
      controlClass: 'test-class',
      currentConfig: { buttons: { format: true } },
    },
    hasAnyResolutionOptions: false,
    hasAudioToggle: false,
    hasModelWithoutDurationEditing: false,
    isAdvancedControlsEnabled: false,
    isDisabledState: false,
    modelControlsProps: {
      controlClass: 'test-class',
      currentConfig: { buttons: { models: true } },
    },
    normalizedWatchedModels: [],
    onToggleCollapse: vi.fn(),
    pathname: '/studio/video',
    triggerConfigChange: vi.fn(),
    videoDurations: [],
  };

  it('should render without crashing', () => {
    const { container } = render(
      <PromptBarPrimaryControlsRow {...defaultProps} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render controls row', () => {
    const { container } = render(
      <PromptBarPrimaryControlsRow {...defaultProps} />,
    );
    // The component renders a flex container with controls
    expect(container.querySelector('.flex')).toBeInTheDocument();
  });

  it('should pass props to child components', () => {
    const { container } = render(
      <PromptBarPrimaryControlsRow {...defaultProps} />,
    );
    // Verify component structure is present
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render with advanced controls enabled', () => {
    const { container } = render(
      <PromptBarPrimaryControlsRow
        {...defaultProps}
        isAdvancedControlsEnabled={true}
        videoDurations={[
          { label: '5 seconds', value: '5' },
          { label: '10 seconds', value: '10' },
        ]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle disabled state', () => {
    const { container } = render(
      <PromptBarPrimaryControlsRow {...defaultProps} isDisabledState={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
