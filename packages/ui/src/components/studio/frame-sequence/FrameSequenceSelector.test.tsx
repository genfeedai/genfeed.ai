import { IngredientFormat } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import FrameSequenceSelector from '@ui/studio/frame-sequence/FrameSequenceSelector';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: () => ({
      openGallery: vi.fn(),
    }),
  }),
);

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    className?: string;
  }) => (
    // Test double for next/image — not a production control.
    <span data-testid="frame-image" data-src={src} className={className}>
      {alt}
    </span>
  ),
}));

const mockFrames = [
  { id: 'frame-1', ingredientUrl: 'https://example.com/image1.jpg' },
  { id: 'frame-2', ingredientUrl: 'https://example.com/image2.jpg' },
  { id: 'frame-3', ingredientUrl: 'https://example.com/image3.jpg' },
];

describe('FrameSequenceSelector', () => {
  const defaultProps = {
    format: IngredientFormat.PORTRAIT,
    frames: [],
    onFrameReorder: vi.fn(),
    onFramesChange: vi.fn(),
  };

  it('renders the card with the sequence label', () => {
    render(<FrameSequenceSelector {...defaultProps} />);
    expect(screen.getByText('Frame Sequence')).toBeInTheDocument();
  });

  it('renders a fully visible add-frame tile in a horizontal filmstrip', () => {
    render(<FrameSequenceSelector {...defaultProps} />);

    const strip = screen.getByTestId('frame-sequence-strip');
    const addButton = screen.getByRole('button', { name: /add frame/i });

    expect(strip).toHaveClass('flex');
    expect(strip).not.toHaveClass('grid');
    expect(addButton).toHaveClass('shrink-0');
    expect(addButton).toHaveClass('h-52');
    expect(addButton).toHaveClass('aspect-[9/16]');
    expect(addButton).toHaveClass('border-dashed');
    expect(screen.getByTestId('frame-sequence-card')).toHaveClass(
      'overflow-visible',
    );
  });

  it('does not wrap portrait tiles in a dense shrinking grid', () => {
    const { container } = render(<FrameSequenceSelector {...defaultProps} />);
    expect(container.querySelector('.grid-cols-3')).not.toBeInTheDocument();
    expect(
      container.querySelector('.lg\\:grid-cols-6'),
    ).not.toBeInTheDocument();
  });

  it('displays provided frames in the filmstrip', () => {
    render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
    expect(screen.getByText('Frame 1')).toBeInTheDocument();
    expect(screen.getByText('Frame 2')).toBeInTheDocument();
    expect(screen.getByText('Frame 3')).toBeInTheDocument();
    expect(screen.getByText(/frames selected/)).toHaveTextContent(
      '3 frames selected.',
    );
  });

  it('shows singular frame copy for one frame', () => {
    render(
      <FrameSequenceSelector {...defaultProps} frames={[mockFrames[0]]} />,
    );
    expect(screen.getByText(/frame selected/)).toHaveTextContent(
      '1 frame selected.',
    );
  });

  it('hides sequence info when empty', () => {
    render(<FrameSequenceSelector {...defaultProps} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('shows transition count for two or more frames', () => {
    render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
    expect(screen.getByText(/Pairs: 2 transitions/)).toBeInTheDocument();
  });

  it('uses landscape aspect for landscape format', () => {
    render(
      <FrameSequenceSelector
        {...defaultProps}
        format={IngredientFormat.LANDSCAPE}
      />,
    );
    expect(screen.getByRole('button', { name: /add frame/i })).toHaveClass(
      'aspect-[16/9]',
    );
  });

  it('uses square aspect for square format', () => {
    render(
      <FrameSequenceSelector
        {...defaultProps}
        format={IngredientFormat.SQUARE}
      />,
    );
    expect(screen.getByRole('button', { name: /add frame/i })).toHaveClass(
      'aspect-[1/1]',
    );
  });

  it('calls onFramesChange when removing a frame', () => {
    const onFramesChange = vi.fn();
    render(
      <FrameSequenceSelector
        {...defaultProps}
        frames={mockFrames}
        onFramesChange={onFramesChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Remove frame 1'));
    expect(onFramesChange).toHaveBeenCalledWith([mockFrames[1], mockFrames[2]]);
  });
});
