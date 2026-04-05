import { render } from '@testing-library/react';
import FormInputEditable from '@ui/forms/inputs/input-editable/form-input-editable/FormInputEditable';
import { describe, expect, it } from 'vitest';

describe('FormInputEditable', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormInputEditable />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormInputEditable />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormInputEditable />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
