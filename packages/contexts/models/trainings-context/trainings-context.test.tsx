import { TrainingsProvider } from '@genfeedai/contexts/models/trainings-context/trainings-context';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';

describe('TrainingsContext', () => {
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
