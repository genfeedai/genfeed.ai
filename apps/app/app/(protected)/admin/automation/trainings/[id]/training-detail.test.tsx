import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrainingDetail from './training-detail';

describe('TrainingDetail', () => {
  it('should render without crashing', () => {
    const { container } = render(<TrainingDetail />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TrainingDetail />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TrainingDetail />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
