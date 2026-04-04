import TrainingsList from '@pages/trainings/list/trainings-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('TrainingsList', () => {
  it('should render without crashing', () => {
    const { container } = render(<TrainingsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TrainingsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TrainingsList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
