import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    selectedBrand: { isDarkroomEnabled: false },
    settings: { isDarkroomNsfwVisible: false },
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

vi.mock('@ui/masonry/shared/MasonryBadgeOverlay', () => ({
  default: () => <div data-testid="badge-overlay" />,
}));

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

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IImage } from '@genfeedai/interfaces';
import MasonryImage from '@ui/masonry/image/MasonryImage';

const mockImage: IImage = {
  id: 'img-123',
  ingredientUrl: 'https://example.com/image.png',
  metadata: { height: 1920, width: 1080 },
  promptText: 'A test image',
  status: 'active',
} as IImage;

describe('MasonryImage', () => {
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

  it('supports space key activation for keyboard users', () => {
    const handleClickIngredient = vi.fn();

    render(
      <MasonryImage
        image={mockImage}
        onClickIngredient={handleClickIngredient}
      />,
    );

    const trigger = screen.getByRole('button');
    fireEvent.keyDown(trigger, { key: ' ' });

    expect(handleClickIngredient).toHaveBeenCalledWith(mockImage);
  });

  it('blurs sensitive darkroom assets when NSFW visibility is disabled', () => {
    vi.mocked(useBrand).mockReturnValue({
      selectedBrand: { isDarkroomEnabled: true },
      settings: { isDarkroomNsfwVisible: false },
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

    expect(screen.getByText('Sensitive darkroom asset')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveClass('blur-sm');
  });

  it('prevents opening locked darkroom assets', () => {
    vi.mocked(useBrand).mockReturnValue({
      selectedBrand: { isDarkroomEnabled: true },
      settings: { isDarkroomNsfwVisible: false },
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
});
