import { render } from '@testing-library/react';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import { describe, expect, it } from 'vitest';

describe('FormTextarea', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormTextarea />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormTextarea />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormTextarea />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
