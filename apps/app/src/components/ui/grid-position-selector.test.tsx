import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPositionSelector } from './grid-position-selector';

describe('GridPositionSelector', () => {
  const defaultProps = {
    onPositionChange: vi.fn(),
    position: { x: 0.5, y: 0.5 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render 9 position buttons', () => {
      const { container } = render(<GridPositionSelector {...defaultProps} />);
      const buttons = container.querySelectorAll('button[title^="Position:"]');
      expect(buttons).toHaveLength(9);
    });

    it('should render label', () => {
      render(<GridPositionSelector {...defaultProps} />);

      expect(screen.getByText('Content Position')).toBeInTheDocument();
    });

    it('should render helper text', () => {
      render(<GridPositionSelector {...defaultProps} />);

      expect(
        screen.getByText('Where original content appears in the new frame')
      ).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <GridPositionSelector {...defaultProps} className="custom-class" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('position selection', () => {
    it('should highlight the selected position', () => {
      render(<GridPositionSelector {...defaultProps} position={{ x: 0.5, y: 0.5 }} />);

      const buttons = screen.getAllByRole('button');
      // Center position is index 4 (row 1, col 1)
      expect(buttons[4]).toHaveClass('bg-primary');
    });

    it('should highlight top-left when position is 0,0', () => {
      render(<GridPositionSelector {...defaultProps} position={{ x: 0, y: 0 }} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveClass('bg-primary');
    });

    it('should highlight bottom-right when position is 1,1', () => {
      render(<GridPositionSelector {...defaultProps} position={{ x: 1, y: 1 }} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[8]).toHaveClass('bg-primary');
    });

    it('should not highlight unselected positions', () => {
      render(<GridPositionSelector {...defaultProps} position={{ x: 0.5, y: 0.5 }} />);

      const buttons = screen.getAllByRole('button');
      // First position (top-left) should not be highlighted
      expect(buttons[0]).not.toHaveClass('bg-primary');
      expect(buttons[0]).toHaveClass('bg-secondary');
    });
  });

  describe('click interactions', () => {
    it('should call onPositionChange with top-left position', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith({
        x: 0,
        y: 0,
      });
    });

    it('should call onPositionChange with center position', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[4]);

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith({
        x: 0.5,
        y: 0.5,
      });
    });

    it('should call onPositionChange with bottom-right position', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[8]);

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith({
        x: 1,
        y: 1,
      });
    });

    it('should call onPositionChange with top-right position', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[2]);

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith({
        x: 1,
        y: 0,
      });
    });

    it('should call onPositionChange with bottom-left position', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[6]);

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith({
        x: 0,
        y: 1,
      });
    });
  });

  describe('button titles', () => {
    it('should have correct title for top-left', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveAttribute('title', 'Position: left, top');
    });

    it('should have correct title for center', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[4]).toHaveAttribute('title', 'Position: center, middle');
    });

    it('should have correct title for bottom-right', () => {
      render(<GridPositionSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[8]).toHaveAttribute('title', 'Position: right, bottom');
    });
  });

  describe('edge case - floating point comparison', () => {
    it('should handle floating point precision', () => {
      // Position close to center but with floating point error
      render(<GridPositionSelector {...defaultProps} position={{ x: 0.500001, y: 0.499999 }} />);

      const buttons = screen.getAllByRole('button');
      // Should still highlight center position
      expect(buttons[4]).toHaveClass('bg-primary');
    });
  });
});
