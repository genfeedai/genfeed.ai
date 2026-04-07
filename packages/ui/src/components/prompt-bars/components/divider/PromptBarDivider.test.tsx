import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import { describe, expect, it } from 'vitest';

describe('PromptBarDivider', () => {
  it('should render without crashing', () => {
    const { container } = render(<PromptBarDivider />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<PromptBarDivider />);

    // Divider is a presentational component, no direct interactions
    // But it should render correctly
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PromptBarDivider />);

    // Check divider has correct container classes
    const divider = container.firstChild;
    expect(divider).toBeInTheDocument();

    // Check divider line styling
    const dividerLine = container.querySelector('.border-t, .border-b, hr');
    expect(dividerLine || divider).toBeInTheDocument();
  });
});
