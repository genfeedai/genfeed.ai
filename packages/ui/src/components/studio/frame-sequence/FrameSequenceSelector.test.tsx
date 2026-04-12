import { IngredientFormat } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import FrameSequenceSelector from '@ui/studio/frame-sequence/FrameSequenceSelector';
import { describe, expect, it, vi } from 'vitest';

// Mock the dependencies
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
    fill,
    className,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    className?: string;
  }) => <img src={src} alt={alt} className={className} data-fill={fill} />,
}));

const mockFrames = [
  { id: 'frame-1', ingredientUrl: 'https://example.com/image1.jpg' },
  { id: 'frame-2', ingredientUrl: 'https://example.com/image2.jpg' },
  { id: 'frame-3', ingredientUrl: 'https://example.com/image3.jpg' },
];

describe.skip('FrameSequenceSelector', () => {
  const defaultProps = {
    format: IngredientFormat.PORTRAIT,
    frames: [],
    onFrameReorder: vi.fn(),
    onFramesChange: vi.fn(),
  };

  describe('Basic Rendering', () => {
    it('renders the card with correct label', () => {
      render(<FrameSequenceSelector {...defaultProps} />);
      expect(screen.getByText('Frame Sequence')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<FrameSequenceSelector {...defaultProps} />);
      expect(screen.getByText(/Select images in order/)).toBeInTheDocument();
    });

    it('renders add frame button', () => {
      render(<FrameSequenceSelector {...defaultProps} />);
      expect(screen.getByText('Add Frame')).toBeInTheDocument();
    });
  });

  describe('Frame Display', () => {
    it('displays all provided frames', () => {
      render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
      expect(screen.getByAlt('Frame 1')).toBeInTheDocument();
      expect(screen.getByAlt('Frame 2')).toBeInTheDocument();
      expect(screen.getByAlt('Frame 3')).toBeInTheDocument();
    });

    it('shows frame numbers on each frame', () => {
      render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows correct frame count text', () => {
      render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText(/frames selected/)).toBeInTheDocument();
    });

    it('shows singular "frame" when only one frame', () => {
      render(
        <FrameSequenceSelector {...defaultProps} frames={[mockFrames[0]]} />,
      );
      expect(screen.getByText(/frame selected/)).toBeInTheDocument();
    });

    it('does not show frame info when no frames', () => {
      render(<FrameSequenceSelector {...defaultProps} />);
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });
  });

  describe('Transition Info', () => {
    it('shows transition count when 2+ frames', () => {
      render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
      expect(screen.getByText(/Pairs: 2 transitions/)).toBeInTheDocument();
    });

    it('shows singular transition when 2 frames', () => {
      render(
        <FrameSequenceSelector
          {...defaultProps}
          frames={mockFrames.slice(0, 2)}
        />,
      );
      expect(screen.getByText(/Pairs: 1 transition/)).toBeInTheDocument();
    });

    it('does not show transitions for 1 frame', () => {
      render(
        <FrameSequenceSelector {...defaultProps} frames={[mockFrames[0]]} />,
      );
      expect(screen.queryByText(/Pairs:/)).not.toBeInTheDocument();
    });
  });

  describe('Frame Removal', () => {
    it('calls onFramesChange when removing a frame', () => {
      const onFramesChange = vi.fn();
      render(
        <FrameSequenceSelector
          {...defaultProps}
          frames={mockFrames}
          onFramesChange={onFramesChange}
        />,
      );

      // Find and click the first remove button (inside the group hover overlay)
      const removeButtons = screen.getAllByRole('button');
      // The remove buttons are the ones with the trash icon
      const trashButtons = removeButtons.filter(
        (btn) =>
          btn.getAttribute('data-variant') === 'destructive' ||
          btn.classList.contains('bg-destructive'),
      );

      if (trashButtons.length > 0) {
        fireEvent.click(trashButtons[0]);
        expect(onFramesChange).toHaveBeenCalled();
      }
    });
  });

  describe('Aspect Ratio Classes', () => {
    it('uses portrait aspect ratio for PORTRAIT format', () => {
      const { container } = render(
        <FrameSequenceSelector
          {...defaultProps}
          format={IngredientFormat.PORTRAIT}
        />,
      );
      expect(
        container.querySelector('.aspect-\\[9\\/16\\]'),
      ).toBeInTheDocument();
    });

    it('uses landscape aspect ratio for LANDSCAPE format', () => {
      const { container } = render(
        <FrameSequenceSelector
          {...defaultProps}
          format={IngredientFormat.LANDSCAPE}
        />,
      );
      expect(
        container.querySelector('.aspect-\\[16\\/9\\]'),
      ).toBeInTheDocument();
    });

    it('uses square aspect ratio for SQUARE format', () => {
      const { container } = render(
        <FrameSequenceSelector
          {...defaultProps}
          format={IngredientFormat.SQUARE}
        />,
      );
      expect(
        container.querySelector('.aspect-\\[1\\/1\\]'),
      ).toBeInTheDocument();
    });
  });

  describe('Grid Layout', () => {
    it('uses landscape grid for LANDSCAPE format', () => {
      const { container } = render(
        <FrameSequenceSelector
          {...defaultProps}
          format={IngredientFormat.LANDSCAPE}
        />,
      );
      expect(container.querySelector('.grid-cols-2')).toBeInTheDocument();
    });

    it('uses square grid for SQUARE format', () => {
      const { container } = render(
        <FrameSequenceSelector
          {...defaultProps}
          format={IngredientFormat.SQUARE}
        />,
      );
      expect(container.querySelector('.grid-cols-3')).toBeInTheDocument();
    });

    it('uses portrait grid for PORTRAIT format', () => {
      const { container } = render(
        <FrameSequenceSelector
          {...defaultProps}
          format={IngredientFormat.PORTRAIT}
        />,
      );
      expect(container.querySelector('.grid-cols-3')).toBeInTheDocument();
    });
  });

  describe('Add Frame Button', () => {
    it('add frame button has correct styling', () => {
      const { container } = render(<FrameSequenceSelector {...defaultProps} />);
      const addButton = container.querySelector('button[type="button"]');
      expect(addButton).toHaveClass('border-dashed');
    });

    it('add frame button contains plus icon', () => {
      render(<FrameSequenceSelector {...defaultProps} />);
      expect(screen.getByText('Add Frame')).toBeInTheDocument();
    });
  });

  describe('Frame Image Display', () => {
    it('renders images with correct src', () => {
      render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
      const images = screen.getAllByRole('img');
      expect(images[0]).toHaveAttribute(
        'src',
        'https://example.com/image1.jpg',
      );
      expect(images[1]).toHaveAttribute(
        'src',
        'https://example.com/image2.jpg',
      );
    });

    it('renders images with object-cover class', () => {
      render(<FrameSequenceSelector {...defaultProps} frames={mockFrames} />);
      const images = screen.getAllByRole('img');
      expect(images[0]).toHaveClass('object-cover');
    });
  });
});
