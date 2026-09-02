import '@testing-library/jest-dom/vitest';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryCanvas from './LibraryCanvas';

const { fitView, save } = vi.hoisted(() => ({
  fitView: vi.fn(),
  save: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="library-canvas-background" />,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => <div data-testid="library-canvas-controls" />,
  MiniMap: ({ className }: { className?: string }) => (
    <div className={className} data-testid="library-canvas-minimap" />
  ),
  ReactFlow: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="library-canvas-flow">
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  applyNodeChanges: <TNode,>(_changes: unknown, nodes: TNode[]) => nodes,
  useReactFlow: () => ({ fitView }),
}));

vi.mock('@genfeedai/hooks/data/content/use-mood-board/use-mood-board', () => ({
  useMoodBoard: () => ({
    board: { id: 'board-1', layout: [] },
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    save,
  }),
}));

vi.mock('@ui/layouts/lightbox/MediaLightbox', () => ({
  default: () => null,
}));

function renderCanvas(ingredients: IIngredient[] = [], isLoading = false) {
  return render(
    <LibraryCanvas ingredients={ingredients} isLoading={isLoading} />,
  );
}

describe('LibraryCanvas', () => {
  beforeEach(() => {
    fitView.mockClear();
  });

  it('keeps Fit in one glass cluster without a title pill or a close action', () => {
    renderCanvas();

    expect(screen.queryByText('Mood board')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-canvas-actions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fit board' }),
    ).toBeInTheDocument();
    // The view toggle is the way out of the canvas, so the canvas owns no
    // close affordance of its own.
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('uses a semantic minimap and drops the default controls', () => {
    renderCanvas();

    expect(screen.getByTestId('library-canvas-minimap').className).toContain(
      'bg-secondary',
    );
    expect(
      screen.queryByTestId('library-canvas-controls'),
    ).not.toBeInTheDocument();
  });

  it('fits the board from the action cluster', async () => {
    const user = userEvent.setup();
    renderCanvas();

    await user.click(screen.getByRole('button', { name: 'Fit board' }));

    expect(fitView).toHaveBeenCalledWith({ duration: 300 });
  });

  it('reports progress only while more assets are still loading', () => {
    const ingredients = [{ id: 'a' }, { id: 'b' }] as IIngredient[];

    const { rerender } = renderCanvas(ingredients, true);
    expect(screen.getByText('Loading… 2 so far')).toBeInTheDocument();

    rerender(<LibraryCanvas ingredients={ingredients} isLoading={false} />);
    expect(screen.queryByText('Loading… 2 so far')).not.toBeInTheDocument();
  });
});
