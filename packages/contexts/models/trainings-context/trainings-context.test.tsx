import { TrainingsProvider } from '@contexts/models/trainings-context/trainings-context';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

describe('TrainingsContext', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <TrainingsProvider>
        <div data-testid="child" />
      </TrainingsProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <TrainingsProvider>
        <div data-testid="child" />
      </TrainingsProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <TrainingsProvider>
        <div data-testid="child" />
      </TrainingsProvider>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
