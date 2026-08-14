import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import MoodBoardCanvas from '@/features/moodboard/MoodBoardCanvas';

const fitView = vi.fn();

vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="moodboard-background" />,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => <div data-testid="moodboard-controls" />,
  MiniMap: ({ className }: { className?: string }) => (
    <div className={className} data-testid="moodboard-minimap" />
  ),
  ReactFlow: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="moodboard-flow">
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  useReactFlow: () => ({ fitView }),
}));

describe('MoodBoardCanvas', () => {
  const onClose = vi.fn();

  function renderCanvas(isTruncated = false) {
    return render(
      <MoodBoardCanvas
        assets={[]}
        nodes={[]}
        onNodesChange={vi.fn()}
        onNodeDragStop={vi.fn()}
        onClose={onClose}
        isTruncated={isTruncated}
      />,
    );
  }

  it('keeps Fit and Close in one glass cluster without a title pill', () => {
    renderCanvas();

    expect(screen.queryByText('Mood board')).not.toBeInTheDocument();
    expect(screen.getByTestId('moodboard-actions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fit board' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close moodboard' }),
    ).toBeInTheDocument();
  });

  it('uses a dark minimap and drops the default white controls', () => {
    renderCanvas();

    expect(screen.getByTestId('moodboard-minimap').className).toContain(
      'bg-secondary',
    );
    expect(screen.queryByTestId('moodboard-controls')).not.toBeInTheDocument();
  });

  it('fits the board from the action cluster', async () => {
    const user = userEvent.setup();
    renderCanvas();

    await user.click(screen.getByRole('button', { name: 'Fit board' }));

    expect(fitView).toHaveBeenCalledWith({ duration: 300 });
  });
});
