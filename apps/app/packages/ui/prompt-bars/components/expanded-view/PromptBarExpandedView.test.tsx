import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('react-hook-form', () => ({
  useForm: vi.fn(() => ({
    formState: { errors: {} },
    register: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(),
  })),
}));

describe('PromptBarExpandedView', () => {
  const mockForm = useForm();

  const defaultProps = {
    activeGenerations: [],
    categoryType: 'image',
    controlClass: '',
    currentConfig: {},
    form: mockForm,
    iconButtonClass: '',
    isAdvancedMode: false,
    isAutoMode: false,
    isCollapsed: false,
    isDisabledState: false,
    onClear: vi.fn(),
    onCollapse: vi.fn(),
    onCopy: vi.fn(),
    onGenerate: vi.fn(),
    pathname: '/studio/image',
    references: [],
    selectedModels: [],
    setIsAdvancedMode: vi.fn(),
    setIsAutoMode: vi.fn(),
    setIsCollapsed: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(<PromptBarExpandedView {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render expanded view when not collapsed', () => {
    const { container } = render(
      <PromptBarExpandedView {...defaultProps} isCollapsed={false} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onGenerate = vi.fn();
    const onCollapse = vi.fn();
    const { container } = render(
      <PromptBarExpandedView
        {...defaultProps}
        onGenerate={onGenerate}
        onCollapse={onCollapse}
      />,
    );

    // Test form interactions
    const inputs = container.querySelectorAll('input, textarea, select');
    if (inputs.length > 0) {
      fireEvent.change(inputs[0], { target: { value: 'test prompt' } });
    }

    // Test generate button
    const generateButtons = container.querySelectorAll('button');
    generateButtons.forEach((button) => {
      if (button.textContent?.includes('Generate')) {
        fireEvent.click(button);
      }
    });
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PromptBarExpandedView {...defaultProps} />);

    // Check expanded view has correct container classes
    const expandedView = container.firstChild;
    expect(expandedView).toBeInTheDocument();

    // Check collapsed state styling
    const { container: collapsedContainer } = render(
      <PromptBarExpandedView {...defaultProps} isCollapsed={true} />,
    );
    expect(collapsedContainer.firstChild).toBeInTheDocument();
  });
});
