import '@testing-library/jest-dom/vitest';
import type { IIngredient } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MoodBoardCanvasClient from '@/features/moodboard/MoodBoardCanvasClient';

const assetsState = {
  assets: [] as IIngredient[],
  isLoading: false,
  isLoadingMore: false,
  isTruncated: false,
  refresh: vi.fn(),
};
const boardState = {
  board: { id: 'board-1', layout: [] },
  isLoading: false,
  error: null,
  refresh: vi.fn(),
  save: vi.fn(),
};

vi.mock(
  '@hooks/data/moodboard/use-brand-media-assets/use-brand-media-assets',
  () => ({ useBrandMediaAssets: () => assetsState }),
);
vi.mock('@hooks/data/content/use-mood-board/use-mood-board', () => ({
  useMoodBoard: () => boardState,
}));
vi.mock('@/features/moodboard/use-mood-board-canvas', () => ({
  useMoodBoardCanvas: () => ({
    nodes: [],
    onNodesChange: vi.fn(),
    onNodeDragStop: vi.fn(),
  }),
}));
vi.mock('@/features/moodboard/MoodBoardCanvas', () => ({
  default: ({
    assets,
    isLoadingMore,
  }: {
    assets: IIngredient[];
    isLoadingMore?: boolean;
  }) => (
    <div
      data-testid="canvas"
      data-loading-more={String(Boolean(isLoadingMore))}
    >
      {assets.length} assets
    </div>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ orgSlug: 'org', brandSlug: 'brand' }),
}));

describe('MoodBoardCanvasClient', () => {
  beforeEach(() => {
    assetsState.assets = [];
    assetsState.isLoading = false;
    assetsState.isLoadingMore = false;
    boardState.isLoading = false;
  });

  it('shows a loading message while assets load', () => {
    assetsState.isLoading = true;
    render(<MoodBoardCanvasClient />);
    expect(screen.getByText(/Gathering your assets/i)).toBeInTheDocument();
  });

  it('shows an empty state with no assets', () => {
    render(<MoodBoardCanvasClient />);
    expect(screen.getByText(/No assets to arrange yet/i)).toBeInTheDocument();
  });

  it('renders the canvas once assets are available', () => {
    assetsState.assets = [
      { id: 'a' } as IIngredient,
      { id: 'b' } as IIngredient,
    ];
    render(<MoodBoardCanvasClient />);
    expect(screen.getByTestId('canvas')).toHaveTextContent('2 assets');
  });

  it('renders the first page while later pages are still streaming', () => {
    assetsState.assets = [{ id: 'a' } as IIngredient];
    assetsState.isLoadingMore = true;

    render(<MoodBoardCanvasClient />);

    const canvas = screen.getByTestId('canvas');
    expect(canvas).toHaveTextContent('1 assets');
    expect(canvas).toHaveAttribute('data-loading-more', 'true');
  });
});
