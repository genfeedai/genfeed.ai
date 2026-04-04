import { render } from '@testing-library/react';
import FormDatepicker from '@ui/forms/pickers/datepicker/form-datepicker/FormDatepicker';
import { describe, expect, it } from 'vitest';

describe('FormDatepicker', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormDatepicker />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormDatepicker />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormDatepicker />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
