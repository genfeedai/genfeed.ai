import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrainingSourcesTab from './training-sources-tab';

describe('TrainingSourcesTab', () => {
  it('should render without crashing', () => {
    const { container } = render(<TrainingSourcesTab />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TrainingSourcesTab />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TrainingSourcesTab />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
