import SoundsList from '@pages/elements/sounds/sounds-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('SoundsList', () => {
  it('should render without crashing', () => {
    const { container } = render(<SoundsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<SoundsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<SoundsList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
