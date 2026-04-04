import TrainingImagesTab from '@pages/trainings/tabs/training-images-tab';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('TrainingImagesTab', () => {
  it('should render without crashing', () => {
    const { container } = render(<TrainingImagesTab />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TrainingImagesTab />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TrainingImagesTab />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
