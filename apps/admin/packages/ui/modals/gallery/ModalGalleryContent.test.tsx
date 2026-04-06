import { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import type { IAsset, IImage, IMusic, IVideo } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalGalleryContent from '@ui/modals/gallery/ModalGalleryContent';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ItemWithId = {
  id: string;
};

type GalleryItem = Partial<IImage> | Partial<IVideo> | Partial<IMusic>;

// Mock the upload modal provider
const mockOpenUpload = vi.fn();
vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useUploadModal: () => ({
    openUpload: mockOpenUpload,
  }),
}));

// Mock dependencies
vi.mock('./items/ModalGalleryItemImage', () => ({
  default: ({ image }: { image: ItemWithId }) => (
    <div data-testid={`image-item-${image.id}`}>{image.id}</div>
  ),
}));

vi.mock('./items/ModalGalleryItemVideo', () => ({
  default: ({ video }: { video: ItemWithId }) => (
    <div data-testid={`video-item-${video.id}`}>{video.id}</div>
  ),
}));

vi.mock('./items/ModalGalleryItemMusic', () => ({
  default: ({ music }: { music: ItemWithId }) => (
    <div data-testid={`music-item-${music.id}`}>{music.id}</div>
  ),
}));

vi.mock('./items/ModalGalleryItemReference', () => ({
  default: ({ reference }: { reference: ItemWithId }) => (
    <div data-testid={`reference-item-${reference.id}`}>{reference.id}</div>
  ),
}));

vi.mock('@ui/display/masonry/Masonry', () => ({
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="masonry">{children}</div>
  ),
}));

vi.mock('@ui/feedback/spinner/Spinner', () => ({
  default: ({ size }: { size?: string }) => (
    <div data-testid="spinner" data-size={size}>
      Loading...
    </div>
  ),
}));

vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonList: ({ count }: { count: number }) => (
    <div data-testid="skeleton-list" data-count={count}>
      Loading skeleton...
    </div>
  ),
}));

describe('ModalGalleryContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    activeTab: 'media' as const,
    category: IngredientCategory.IMAGE,
    getFormatLabel: vi.fn((format) => format || 'portrait'),
    getImageFormat: vi.fn(() => IngredientFormat.PORTRAIT),
    isLoading: false,
    items: [],
    localFormat: IngredientFormat.PORTRAIT,
    onMusicPlayPause: vi.fn(),
    onSelectItem: vi.fn(),
    onSelectionLimit: vi.fn(),
    onSelectReference: vi.fn(),
    playingId: '',
    selectedItem: '',
    selectedItems: [],
    selectionLimit: Infinity,
  };

  it('renders skeleton list when loading media', () => {
    render(<ModalGalleryContent {...defaultProps} isLoading={true} />);
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('renders empty state when no items', () => {
    render(<ModalGalleryContent {...defaultProps} />);
    expect(
      screen.getByText(/No portrait images available/),
    ).toBeInTheDocument();
  });

  it('renders image items when items are provided', () => {
    const items: GalleryItem[] = [
      { height: 1920, id: 'img-1', width: 1080 },
      { height: 1920, id: 'img-2', width: 1080 },
    ];
    render(
      <ModalGalleryContent
        {...defaultProps}
        items={items as (IImage | IVideo | IMusic)[]}
      />,
    );
    expect(screen.getByTestId('image-item-img-1')).toBeInTheDocument();
    expect(screen.getByTestId('image-item-img-2')).toBeInTheDocument();
  });

  it('renders video items for video category', () => {
    const items: GalleryItem[] = [{ id: 'vid-1' }, { id: 'vid-2' }];
    render(
      <ModalGalleryContent
        {...defaultProps}
        category={IngredientCategory.VIDEO}
        items={items as (IImage | IVideo | IMusic)[]}
      />,
    );
    expect(screen.getByTestId('video-item-vid-1')).toBeInTheDocument();
    expect(screen.getByTestId('video-item-vid-2')).toBeInTheDocument();
  });

  it('renders music items for music category', () => {
    const items: GalleryItem[] = [{ id: 'music-1' }, { id: 'music-2' }];
    render(
      <ModalGalleryContent
        {...defaultProps}
        category={IngredientCategory.MUSIC}
        items={items as (IImage | IVideo | IMusic)[]}
      />,
    );
    expect(screen.getByTestId('music-item-music-1')).toBeInTheDocument();
    expect(screen.getByTestId('music-item-music-2')).toBeInTheDocument();
  });

  it('renders brand references when on references tab', () => {
    const references: Partial<IAsset>[] = [{ id: 'ref-1' }, { id: 'ref-2' }];
    render(
      <ModalGalleryContent
        {...defaultProps}
        activeTab="references"
        references={references as IAsset[]}
      />,
    );
    expect(screen.getByTestId('reference-item-ref-1')).toBeInTheDocument();
    expect(screen.getByTestId('reference-item-ref-2')).toBeInTheDocument();
  });

  it('renders empty state when no brand references', () => {
    render(<ModalGalleryContent {...defaultProps} activeTab="references" />);
    expect(screen.getByText('No brand references found.')).toBeInTheDocument();
  });

  it('renders loading spinner when loading references', () => {
    render(
      <ModalGalleryContent
        {...defaultProps}
        activeTab="references"
        isLoadingReferences={true}
      />,
    );
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  describe('uploads tab', () => {
    it('renders skeleton when uploads tab is loading', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          activeTab="uploads"
          isLoading={true}
        />,
      );
      expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
    });

    it('always renders upload card even when no uploads', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          activeTab="uploads"
          uploads={[]}
        />,
      );
      expect(
        screen.getByRole('button', { name: /upload image/i }),
      ).toBeInTheDocument();
    });

    it('triggers upload modal when clicking upload card', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          activeTab="uploads"
          uploads={[]}
        />,
      );
      const uploadButton = screen.getByRole('button', {
        name: /upload image/i,
      });
      fireEvent.click(uploadButton);
      expect(mockOpenUpload).toHaveBeenCalledWith({
        category: IngredientCategory.IMAGE,
      });
    });

    it('renders upload card alongside uploaded images', () => {
      const uploads: Partial<IImage>[] = [
        { height: 1920, id: 'upload-1', width: 1080 },
        { height: 1920, id: 'upload-2', width: 1080 },
      ];
      render(
        <ModalGalleryContent
          {...defaultProps}
          activeTab="uploads"
          uploads={uploads as IImage[]}
        />,
      );
      expect(
        screen.getByRole('button', { name: /upload image/i }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('image-item-upload-1')).toBeInTheDocument();
      expect(screen.getByTestId('image-item-upload-2')).toBeInTheDocument();
    });
  });

  describe('empty states', () => {
    it('renders empty state for videos', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.VIDEO}
          items={[]}
        />,
      );
      expect(
        screen.getByText(/No portrait videos available/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Generate some videos first/),
      ).toBeInTheDocument();
    });

    it('renders empty state for music', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.MUSIC}
          items={[]}
        />,
      );
      expect(screen.getByText(/No music tracks available/)).toBeInTheDocument();
      expect(screen.getByText(/Generate some music first/)).toBeInTheDocument();
    });
  });

  describe('landscape format', () => {
    it('renders images with landscape column layout', () => {
      const items: GalleryItem[] = [
        { height: 1080, id: 'img-landscape-1', width: 1920 },
      ];
      render(
        <ModalGalleryContent
          {...defaultProps}
          localFormat={IngredientFormat.LANDSCAPE}
          items={items as (IImage | IVideo | IMusic)[]}
        />,
      );
      expect(
        screen.getByTestId('image-item-img-landscape-1'),
      ).toBeInTheDocument();
    });

    it('renders uploads with landscape column layout', () => {
      const uploads: Partial<IImage>[] = [
        { height: 1080, id: 'upload-landscape-1', width: 1920 },
      ];
      render(
        <ModalGalleryContent
          {...defaultProps}
          activeTab="uploads"
          localFormat={IngredientFormat.LANDSCAPE}
          uploads={uploads as IImage[]}
        />,
      );
      expect(
        screen.getByRole('button', { name: /upload image/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('image-item-upload-landscape-1'),
      ).toBeInTheDocument();
    });
  });

  describe('tab behavior for non-image categories', () => {
    it('does not render uploads tab for video category', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.VIDEO}
          activeTab="uploads"
          uploads={[]}
        />,
      );
      // Should fall through to media tab empty state for videos
      expect(
        screen.getByText(/No portrait videos available/),
      ).toBeInTheDocument();
    });

    it('does not render references tab for video category', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.VIDEO}
          activeTab="references"
          references={[]}
        />,
      );
      // Should fall through to media tab empty state
      expect(
        screen.getByText(/No portrait videos available/),
      ).toBeInTheDocument();
    });

    it('does not render uploads tab for music category', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.MUSIC}
          activeTab="uploads"
          uploads={[]}
        />,
      );
      // Should fall through to media tab empty state for music
      expect(screen.getByText(/No music tracks available/)).toBeInTheDocument();
    });
  });

  describe('square format', () => {
    it('renders images with square format', () => {
      const items: GalleryItem[] = [
        { height: 1080, id: 'img-square-1', width: 1080 },
      ];
      render(
        <ModalGalleryContent
          {...defaultProps}
          localFormat={IngredientFormat.SQUARE}
          items={items as (IImage | IVideo | IMusic)[]}
        />,
      );
      expect(screen.getByTestId('image-item-img-square-1')).toBeInTheDocument();
    });

    it('shows square format in empty message', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          localFormat={IngredientFormat.SQUARE}
          items={[]}
        />,
      );
      expect(
        screen.getByText(/No square images available/),
      ).toBeInTheDocument();
    });
  });

  describe('selection states', () => {
    it('passes selected state to image items', () => {
      const items: GalleryItem[] = [
        { height: 1920, id: 'img-1', width: 1080 },
        { height: 1920, id: 'img-2', width: 1080 },
      ];
      render(
        <ModalGalleryContent
          {...defaultProps}
          items={items as (IImage | IVideo | IMusic)[]}
          selectedItems={['img-1']}
        />,
      );
      expect(screen.getByTestId('image-item-img-1')).toBeInTheDocument();
      expect(screen.getByTestId('image-item-img-2')).toBeInTheDocument();
    });

    it('passes selected state to music items', () => {
      const items: GalleryItem[] = [{ id: 'music-1' }];
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.MUSIC}
          items={items as (IImage | IVideo | IMusic)[]}
          selectedItem="music-1"
        />,
      );
      expect(screen.getByTestId('music-item-music-1')).toBeInTheDocument();
    });

    it('passes playing state to music items', () => {
      const items: GalleryItem[] = [{ id: 'music-1' }];
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.MUSIC}
          items={items as (IImage | IVideo | IMusic)[]}
          playingId="music-1"
        />,
      );
      expect(screen.getByTestId('music-item-music-1')).toBeInTheDocument();
    });
  });

  describe('callback props', () => {
    it('calls getFormatLabel with format', () => {
      const mockGetFormatLabel = vi.fn((format) => format || 'portrait');
      const items: GalleryItem[] = [{ height: 1920, id: 'img-1', width: 1080 }];
      render(
        <ModalGalleryContent
          {...defaultProps}
          items={items as (IImage | IVideo | IMusic)[]}
          getFormatLabel={mockGetFormatLabel}
        />,
      );
      expect(screen.getByTestId('image-item-img-1')).toBeInTheDocument();
    });

    it('renders masonry component for video items', () => {
      const items: GalleryItem[] = [
        { id: 'vid-1' },
        { id: 'vid-2' },
        { id: 'vid-3' },
      ];
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.VIDEO}
          items={items as (IImage | IVideo | IMusic)[]}
        />,
      );
      expect(screen.getByTestId('masonry')).toBeInTheDocument();
      expect(screen.getByTestId('video-item-vid-1')).toBeInTheDocument();
      expect(screen.getByTestId('video-item-vid-2')).toBeInTheDocument();
      expect(screen.getByTestId('video-item-vid-3')).toBeInTheDocument();
    });

    it('renders grid for music items', () => {
      const items: GalleryItem[] = [
        { id: 'music-1' },
        { id: 'music-2' },
        { id: 'music-3' },
      ];
      const { container } = render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.MUSIC}
          items={items as (IImage | IVideo | IMusic)[]}
        />,
      );
      // Music uses grid, not masonry
      expect(container.querySelector('.grid')).toBeInTheDocument();
    });
  });

  describe('loading states for uploads', () => {
    it('shows skeleton when uploads tab is loading for IMAGE category', () => {
      render(
        <ModalGalleryContent
          {...defaultProps}
          category={IngredientCategory.IMAGE}
          activeTab="uploads"
          isLoading={true}
        />,
      );
      expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
    });
  });
});
