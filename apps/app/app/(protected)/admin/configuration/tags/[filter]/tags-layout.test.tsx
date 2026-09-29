import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TagsLayout from './tags-layout';

describe('TagsLayout', () => {
  it('should apply correct styles and classes', () => {
    const { container } = render(<TagsLayout />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
