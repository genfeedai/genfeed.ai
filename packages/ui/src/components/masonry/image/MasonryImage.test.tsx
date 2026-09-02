import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    selectedBrand: { isFleetEnabled: false },
    settings: { isFleetNsfwVisible: false },
  })),
}));

// Mock hooks used by MasonryImage
vi.mock(
  '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => ({
    default: () => ({
      actionStates: {},
      clearEnhanceConfirm: vi.fn(),
      clearUpscaleConfirm: vi.fn(),
      enhanceConfirmData: null,
      executeEnhance: vi.fn(),
      executeUpscale: vi.fn(),
      handlers: {
        handleClone: vi.fn(),
        handleConvertToGif: vi.fn(),
        handleDelete: vi.fn(),
        handleLandscape: vi.fn(),
        handleMirror: vi.fn(),
        handlePortrait: vi.fn(),
        handlePublish: vi.fn(),
        handleReverse: vi.fn(),
        handleSetAsBanner: vi.fn(),
        handleSetAsLogo: vi.fn(),
        handleSquare: vi.fn(),
        handleUpscale: vi.fn(),
      },
      upscaleConfirmData: null,
    }),
  }),
);

vi.mock('@ui/masonry/shared/MasonryBrandLogo', () => ({
  default: () => <div data-testid="brand-logo" />,
}));

vi.mock('@ui/masonry/shared/MasonryConfirmBridge', () => ({
  default: () => null,
}));

vi.mock('@ui/masonry/shared/useMasonryHover', () => ({
  createDownloadHandler: vi.fn(() => vi.fn()),
  useMasonryHover: vi.fn(() => ({
    handleMouseEnter: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleQuickActionsMouseEnter: vi.fn(),
    handleQuickActionsMouseLeave: vi.fn(),
    isHovered: false,
    showActions: true,
  })),
}));

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: () => <div data-testid="quick-actions" />,
}));

vi.mock('@ui/drag-drop/draggable/DraggableIngredient', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/drag-drop/zone-ingredient/DropZoneIngredient', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/dropdowns/status/DropdownStatus', () => ({
  default: () => <div data-testid="dropdown-status" />,
}));

vi.mock('@ui/loading/overlay/LoadingOverlay', () => ({
  default: () => <div data-testid="loading-overlay" />,
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    assetsEndpoint: 'https://assets.test.com',
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { IngredientStatus } from '@genfeedai/enums';
import type { IImage } from '@genfeedai/interfaces';
import MasonryImage from '@ui/masonry/image/MasonryImage';

const defaultBrandContext = {
  selectedBrand: { isFleetEnabled: false },
  settings: { isFleetNsfwVisible: false },
} as ReturnType<typeof useBrand>;

const mockImage: IImage = {
  id: 'img-123',
  ingredientUrl: 'https://example.com/image.png',
  metadata: { height: 1920, width: 1080 },
  promptText: 'A test image',
  status: 'active',
} as IImage;

describe('MasonryImage', () => {
  beforeEach(() => {
    vi.mocked(useBrand).mockReturnValue(defaultBrandContext);
  });

  it('should render without crashing', () => {
    const { container } = render(<MasonryImage image={mockImage} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<MasonryImage image={mockImage} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(<MasonryImage image={mockImage} />);

    expect(screen.getByRole('button')).toHaveClass('rounded-lg');
  });

  it('uses the loaded image dimensions instead of stale square metadata', () => {
    const { container } = render(
      <MasonryImage
        image={{
          ...mockImage,
          metadata: { height: 1080, width: 1080 },
        }}
      />,
    );
    const image = screen.getByRole('img');
    Object.defineProperties(image, {
      naturalHeight: { configurable: true, value: 900 },
      naturalWidth: { configurable: true, value: 1600 },
    });

    fireEvent.load(image);

    expect(container.querySelector('[data-masonry-item="true"]')).toHaveStyle({
      aspectRatio: '1600 / 900',
    });
  });

  it('keeps square mode authoritative after the image loads', () => {
    const { container } = render(<MasonryImage image={mockImage} isSquare />);
    const image = screen.getByRole('img');
    Object.defineProperties(image, {
      naturalHeight: { configurable: true, value: 900 },
      naturalWidth: { configurable: true, value: 1600 },
    });

    fireEvent.load(image);

    const masonryItem = container.querySelector('[data-masonry-item="true"]');
    expect(masonryItem).toHaveClass('aspect-square');
    expect(masonryItem).not.toHaveStyle({ aspectRatio: '1600 / 900' });
  });

  it('supports space key activation for keyboard users', async () => {
    const user = userEvent.setup();
    const handleClickIngredient = vi.fn();

    render(
      <MasonryImage
        image={mockImage}
        onClickIngredient={handleClickIngredient}
      />,
    );

    const trigger = screen.getByRole('button');
    trigger.focus();
    await user.keyboard(' ');

    expect(handleClickIngredient).toHaveBeenCalledWith(mockImage);
  });

  it('blurs sensitive fleet assets when NSFW visibility is disabled', () => {
    vi.mocked(useBrand).mockReturnValue({
      selectedBrand: { isFleetEnabled: true },
      settings: { isFleetNsfwVisible: false },
    } as ReturnType<typeof useBrand>);

    render(
      <MasonryImage
        image={{
          ...mockImage,
          contentRating: 'nsfw',
          personaSlug: 'test-character',
        }}
      />,
    );

    expect(screen.getByText('Sensitive fleet asset')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveClass('blur-sm');
  });

  it('prevents opening locked fleet assets', () => {
    vi.mocked(useBrand).mockReturnValue({
      selectedBrand: { isFleetEnabled: true },
      settings: { isFleetNsfwVisible: false },
    } as ReturnType<typeof useBrand>);

    const handleClickIngredient = vi.fn();

    render(
      <MasonryImage
        image={{
          ...mockImage,
          contentRating: 'nsfw',
          personaSlug: 'test-character',
        }}
        onClickIngredient={handleClickIngredient}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(handleClickIngredient).not.toHaveBeenCalled();
  });

  it('keeps broken remote assets in an explicit fallback state', () => {
    render(<MasonryImage image={mockImage} />);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.getByTestId('masonry-ingredient-img-123')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
    expect(
      screen.getByTestId('asset-media-fallback-img-123'),
    ).toHaveTextContent('Preview unavailable');
    expect(screen.getByTestId('asset-media-fallback-img-123')).toHaveClass(
      'bg-secondary/90',
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://assets.test.com/placeholders/portrait.jpg',
    );

    fireEvent.load(screen.getByRole('img'));

    expect(screen.getByTestId('masonry-ingredient-img-123')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
  });

  it('marks missing asset urls as fallback previews', () => {
    render(<MasonryImage image={{ ...mockImage, ingredientUrl: undefined }} />);

    expect(screen.getByTestId('masonry-ingredient-img-123')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
    expect(
      screen.getByTestId('asset-media-fallback-img-123'),
    ).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://assets.test.com/placeholders/portrait.jpg',
    );
  });

  it('notifies a parent surface when the real image fails', () => {
    const onMediaError = vi.fn();

    render(<MasonryImage image={mockImage} onMediaError={onMediaError} />);
    fireEvent.error(screen.getByRole('img'));

    expect(onMediaError).toHaveBeenCalledOnce();
  });

  it('keeps processing assets in a processing state, not a fallback', () => {
    render(
      <MasonryImage
        image={{
          ...mockImage,
          ingredientUrl: undefined,
          status: IngredientStatus.PROCESSING,
        }}
      />,
    );

    expect(screen.getByTestId('masonry-ingredient-img-123')).toHaveAttribute(
      'data-asset-media-state',
      'processing',
    );
    expect(
      screen.queryByTestId('asset-media-fallback-img-123'),
    ).not.toBeInTheDocument();
  });

  it('reports a genuine asset load but not the post-error placeholder load', () => {
    const handleImageLoad = vi.fn();

    render(<MasonryImage image={mockImage} onImageLoad={handleImageLoad} />);

    // A genuine load of the real asset is reported once.
    fireEvent.load(screen.getByRole('img'));
    expect(handleImageLoad).toHaveBeenCalledTimes(1);

    // The real image then errors, swapping src to the placeholder.
    fireEvent.error(screen.getByRole('img'));
    // The placeholder finishing its load must NOT be reported as a success.
    fireEvent.load(screen.getByRole('img'));
    expect(handleImageLoad).toHaveBeenCalledTimes(1);
  });

  it('shows the failure reason and a Retry control for a FAILED asset when onReprompt is provided', () => {
    const onReprompt = vi.fn();

    render(
      <MasonryImage
        image={{
          ...mockImage,
          generationError: 'Provider rejected the prompt.',
          status: IngredientStatus.FAILED,
        }}
        onReprompt={onReprompt}
      />,
    );

    const overlay = screen.getByTestId('asset-failure-overlay-img-123');
    expect(overlay).toHaveTextContent('Provider rejected the prompt.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry generation' }));

    expect(onReprompt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'img-123',
        status: IngredientStatus.FAILED,
      }),
    );
  });

  it('renders only the failure reason for a FAILED asset when onReprompt is not provided', () => {
    render(
      <MasonryImage
        image={{
          ...mockImage,
          generationError: 'Provider rejected the prompt.',
          status: IngredientStatus.FAILED,
        }}
      />,
    );

    expect(
      screen.getByTestId('asset-failure-reason-img-123'),
    ).toHaveTextContent('Provider rejected the prompt.');
    expect(
      screen.queryByTestId('asset-failure-overlay-img-123'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry generation' }),
    ).not.toBeInTheDocument();
  });

  it('renders neither the failure reason nor Retry for a non-failed asset', () => {
    const onReprompt = vi.fn();

    render(<MasonryImage image={mockImage} onReprompt={onReprompt} />);

    expect(
      screen.queryByTestId('asset-failure-overlay-img-123'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('asset-failure-reason-img-123'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry generation' }),
    ).not.toBeInTheDocument();
  });
});
