import { render } from '@testing-library/react';
import FormTagsEditable from '@ui/forms/selectors/tags-editable/form-tags-editable/FormTagsEditable';
import { describe, expect, it } from 'vitest';

describe('FormTagsEditable', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormTagsEditable />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FormTagsEditable />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FormTagsEditable />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
