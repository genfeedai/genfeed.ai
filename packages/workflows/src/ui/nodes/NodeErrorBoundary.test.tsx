import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NodeErrorBoundary } from './NodeErrorBoundary';

const loggerError = vi.fn();
vi.mock('../stores/executionLogger', () => ({
  getWorkflowLogger: () => ({
    debug: vi.fn(),
    error: (...args: unknown[]) => loggerError(...args),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('render exploded');
  }
  return <div data-testid="healthy-child">ok</div>;
}

describe('NodeErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <NodeErrorBoundary nodeId="n1" nodeType="imageGen">
        <Bomb shouldThrow={false} />
      </NodeErrorBoundary>,
    );

    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
  });

  it('shows the fallback and logs when a child crashes', () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      render(
        <NodeErrorBoundary nodeId="n1" nodeType="imageGen">
          <Bomb shouldThrow={true} />
        </NodeErrorBoundary>,
      );
    } finally {
      consoleSpy.mockRestore();
    }

    expect(screen.getByText('Node Error')).toBeInTheDocument();
    expect(screen.getByText('render exploded')).toBeInTheDocument();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('n1'),
      expect.anything(),
    );
  });

  it('retry clears the error state and re-renders children', () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    let shouldThrow = true;
    function Flaky() {
      return <Bomb shouldThrow={shouldThrow} />;
    }

    try {
      render(
        <NodeErrorBoundary nodeId="n1" nodeType="imageGen">
          <Flaky />
        </NodeErrorBoundary>,
      );
      expect(screen.getByText('Node Error')).toBeInTheDocument();

      shouldThrow = false;
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    } finally {
      consoleSpy.mockRestore();
    }

    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
  });
});
