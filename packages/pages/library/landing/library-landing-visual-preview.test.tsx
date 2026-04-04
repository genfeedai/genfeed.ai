import LibraryLandingVisualPreview from '@pages/library/landing/library-landing-visual-preview';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindVideos = vi.fn();
const mockFindImages = vi.fn();
const mockFindGifs = vi.fn();

vi.mock(
  '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services',
  () => ({
    useIngredientServices: () => ({
      getGifsService: async () => ({ findAll: mockFindGifs }),
      getImagesService: async () => ({ findAll: mockFindImages }),
      getVideosService: async () => ({ findAll: mockFindVideos }),
    }),
  }),
);

describe('LibraryLandingVisualPreview', () => {
  beforeEach(() => {
    mockFindVideos.mockReset();
    mockFindImages.mockReset();
    mockFindGifs.mockReset();

    mockFindVideos.mockResolvedValue([
      {
        category: 'video',
        id: 'video-1',
        ingredientUrl: 'https://cdn.genfeed.ai/mock/video-1.jpg',
        metadataLabel: 'Launch Recap',
        status: 'generated',
      },
    ]);
    mockFindImages.mockResolvedValue([
      {
        category: 'image',
        id: 'image-1',
        ingredientUrl: 'https://cdn.genfeed.ai/mock/image-1.jpg',
        metadataLabel: 'Hero Still',
        status: 'validated',
      },
    ]);
    mockFindGifs.mockResolvedValue([]);
  });

  it('renders the visual preview grid and requests recent visual assets', async () => {
    render(<LibraryLandingVisualPreview />);

    expect(screen.getByTestId('library-visual-preview')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFindVideos).toHaveBeenCalled();
      expect(mockFindImages).toHaveBeenCalled();
      expect(mockFindGifs).toHaveBeenCalled();
    });

    expect(screen.getByAltText('Launch Recap')).toBeInTheDocument();
    expect(screen.getByAltText('Hero Still')).toBeInTheDocument();
  });

  it('keeps placeholder tiles visible when preview loading fails', async () => {
    mockFindVideos.mockRejectedValueOnce(new Error('videos unavailable'));
    mockFindImages.mockRejectedValueOnce(new Error('images unavailable'));
    mockFindGifs.mockRejectedValueOnce(new Error('gifs unavailable'));

    render(<LibraryLandingVisualPreview />);

    await waitFor(() => {
      expect(mockFindVideos).toHaveBeenCalled();
    });

    expect(screen.getByText('Videos')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
  });
});
