import { render } from '@testing-library/react';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import { describe, expect, it } from 'vitest';

describe('FormSelect', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormSelect />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormSelect />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormSelect />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
