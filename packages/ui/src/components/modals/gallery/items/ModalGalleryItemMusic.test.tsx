import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AudioPreviewPlayerProps } from '@ui/audio/preview-player/AudioPreviewPlayer';
import ModalGalleryItemMusic from '@ui/modals/gallery/items/ModalGalleryItemMusic';
import type { MouseEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({ audioUrl, label, stopOnUnmount }: AudioPreviewPlayerProps) => (
    <button
      type="button"
      data-testid="shared-audio-player"
      data-url={audioUrl}
      data-stop-on-unmount={stopOnUnmount}
      aria-label={`Preview ${label}`}
    />
  ),
}));

// Mock dependencies
vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    label,
    onClick,
    className,
  }: {
    children?: ReactNode;
    className?: string;
    label?: ReactNode;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button
      onClick={onClick}
      className={className}
      data-testid={label ? 'play-button' : undefined}
    >
      {children ?? (typeof label === 'object' ? 'icon' : label)}
    </button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'http://api.example.com/ingredients',
  },
}));

vi.mock('@genfeedai/helpers', () => ({
  formatDuration: (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },
}));

describe('ModalGalleryItemMusic', () => {
  const defaultProps = {
    isSelected: false,
    music: {
      id: 'music-1',
      ingredientUrl: 'http://example.com/music.mp3',
      metadata: { label: 'Test Music' },
      metadataDuration: 120,
    },
    onSelect: vi.fn(),
  };

  it('renders music item', () => {
    render(<ModalGalleryItemMusic {...defaultProps} />);
    expect(screen.getByText('Test Music')).toBeInTheDocument();
  });

  it('displays music duration', () => {
    render(<ModalGalleryItemMusic {...defaultProps} />);
    expect(screen.getByText(/2:00/)).toBeInTheDocument();
  });

  it('displays selected state when selected', () => {
    const { container } = render(
      <ModalGalleryItemMusic {...defaultProps} isSelected={true} />,
    );
    // The root div uses the strong shadow-border ring + tinted background when selected
    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv).toHaveClass('shadow-border-strong');
    expect(rootDiv).toHaveClass('bg-primary/5');
  });

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ModalGalleryItemMusic {...defaultProps} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /^Test Music/i }));
    expect(onSelect).toHaveBeenCalledWith(defaultProps.music);
  });

  it('uses shared playback without changing selection and stops playback when removed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <ModalGalleryItemMusic {...defaultProps} onSelect={onSelect} />,
    );
    const player = screen.getByTestId('shared-audio-player');
    expect(player).toHaveAttribute('data-url', 'http://example.com/music.mp3');
    expect(player).toHaveAttribute('data-stop-on-unmount', 'true');
    await user.click(player);
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector('button button')).toBeNull();
  });

  it('uses fallback URL when ingredientUrl is not provided', () => {
    render(
      <ModalGalleryItemMusic
        {...defaultProps}
        music={{ ...defaultProps.music, ingredientUrl: undefined }}
      />,
    );
    expect(screen.getByTestId('shared-audio-player')).toHaveAttribute(
      'data-url',
      'http://api.example.com/ingredients/musics/music-1',
    );
  });

  it('displays Untitled when no label in metadata', () => {
    const musicWithoutLabel = {
      ...defaultProps.music,
      metadata: {},
    };
    render(
      <ModalGalleryItemMusic {...defaultProps} music={musicWithoutLabel} />,
    );
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('displays Untitled when metadata is null', () => {
    const musicWithNullMetadata = {
      ...defaultProps.music,
      metadata: null,
    };
    render(
      <ModalGalleryItemMusic
        {...defaultProps}
        music={musicWithNullMetadata as any}
      />,
    );
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('displays selection indicator when selected', () => {
    const { container } = render(
      <ModalGalleryItemMusic {...defaultProps} isSelected={true} />,
    );
    // Check for the selection dot
    const selectionDot = container.querySelector('.bg-primary.rounded-full');
    expect(selectionDot).toBeInTheDocument();
  });

  it('does not display selection indicator when not selected', () => {
    const { container } = render(
      <ModalGalleryItemMusic {...defaultProps} isSelected={false} />,
    );
    const selectionDot = container.querySelector('.absolute.top-2.right-2');
    expect(selectionDot).not.toBeInTheDocument();
  });

  it('does not display duration when metadataDuration is not provided', () => {
    const musicWithoutDuration = {
      ...defaultProps.music,
      metadataDuration: undefined,
    };
    render(
      <ModalGalleryItemMusic {...defaultProps} music={musicWithoutDuration} />,
    );
    expect(screen.queryByText(/:/)).not.toBeInTheDocument();
  });
});
