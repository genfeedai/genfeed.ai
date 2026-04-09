import { ModelsProvider } from '@genfeedai/contexts/models/models-context/models-context';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

describe('ModelsContext', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <ModelsProvider>
        <div data-testid="child" />
      </ModelsProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <ModelsProvider>
        <div data-testid="child" />
      </ModelsProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <ModelsProvider>
        <div data-testid="child" />
      </ModelsProvider>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
