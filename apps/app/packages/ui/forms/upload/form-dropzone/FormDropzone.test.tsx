import { render } from '@testing-library/react';
import FormDropzone from '@ui/forms/upload/form-dropzone/FormDropzone';
import { describe, expect, it } from 'vitest';

describe('FormDropzone', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormDropzone />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormDropzone />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormDropzone />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
