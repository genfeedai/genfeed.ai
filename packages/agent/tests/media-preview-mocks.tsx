import { ButtonVariant } from '@genfeedai/contracts';
import type {
  MasonryImageProps,
  MasonryVideoProps,
} from '@genfeedai/props/content/masonry.props';
import type { MediaLightboxProps } from '@genfeedai/props/layout/media-lightbox.props';
import { Button } from '@ui/primitives/button';
import { vi } from 'vitest';

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: ({
    image,
    onClickIngredient,
    isActionsEnabled,
    isDragEnabled,
  }: MasonryImageProps) => (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      type="button"
      data-testid="masonry-image"
      data-url={image.ingredientUrl}
      data-actions={isActionsEnabled}
      data-drag={isDragEnabled}
      onClick={() => onClickIngredient?.(image)}
    >
      {image.metadataLabel}
    </Button>
  ),
  LazyMasonryVideo: ({ video, onClickIngredient }: MasonryVideoProps) => (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      type="button"
      data-testid="masonry-video"
      data-url={video.ingredientUrl}
      onClick={() => onClickIngredient?.(video)}
    >
      {video.metadataLabel}
    </Button>
  ),
}));
vi.mock('@ui/layouts/lightbox/MediaLightbox', () => ({
  default: ({ items, startIndex, onClose }: MediaLightboxProps) => (
    <div
      role="dialog"
      data-index={startIndex}
      data-count={items.length}
      data-url={items[startIndex].ingredientUrl}
    >
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        type="button"
        onClick={onClose}
      >
        Close preview
      </Button>
    </div>
  ),
}));
vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: () => <div data-testid="shared-audio-player" />,
}));
