import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';

describe('TextareaLabelActions', () => {
  it('should render without crashing', () => {
    const { container } = render(<TextareaLabelActions />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
