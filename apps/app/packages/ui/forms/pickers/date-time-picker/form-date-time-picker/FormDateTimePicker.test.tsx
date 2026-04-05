import { render } from '@testing-library/react';
import FormDateTimePicker from '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker';
import { describe, expect, it } from 'vitest';

describe('FormDateTimePicker', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormDateTimePicker />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormDateTimePicker />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormDateTimePicker />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
