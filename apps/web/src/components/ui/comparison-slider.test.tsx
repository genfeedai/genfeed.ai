import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComparisonSlider } from './comparison-slider';

describe('ComparisonSlider', () => {
  const defaultProps = {
    afterSrc: '/images/after.jpg',
    beforeSrc: '/images/before.jpg',
    onPositionChange: vi.fn(),
    position: 50,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render with before and after images', () => {
      render(<ComparisonSlider {...defaultProps} />);

      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(2);
      expect(images[0]).toHaveAttribute('src', defaultProps.afterSrc);
      expect(images[1]).toHaveAttribute('src', defaultProps.beforeSrc);
    });

    it('should render default labels', () => {
      render(<ComparisonSlider {...defaultProps} />);

      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(screen.getByText('After')).toBeInTheDocument();
    });

    it('should render custom labels', () => {
      render(<ComparisonSlider {...defaultProps} beforeLabel="Original" afterLabel="Enhanced" />);

      expect(screen.getByText('Original')).toBeInTheDocument();
      expect(screen.getByText('Enhanced')).toBeInTheDocument();
    });

    it('should apply custom height', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} height={200} />);

      const slider = container.firstChild as HTMLElement;
      expect(slider).toHaveStyle({ height: '200px' });
    });

    it('should apply default height of 128px', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);

      const slider = container.firstChild as HTMLElement;
      expect(slider).toHaveStyle({ height: '128px' });
    });

    it('should apply custom className', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} className="custom-class" />);

      const slider = container.firstChild as HTMLElement;
      expect(slider).toHaveClass('custom-class');
    });
  });

  describe('mouse interactions', () => {
    it('should call onPositionChange on mouse down', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      // Mock getBoundingClientRect
      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      fireEvent.mouseDown(slider, { clientX: 100 });

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith(50);
    });

    it('should call onPositionChange on mouse move while dragging', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      // Start dragging
      fireEvent.mouseDown(slider, { clientX: 100 });
      vi.clearAllMocks();

      // Move mouse
      fireEvent.mouseMove(slider, { clientX: 150 });

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith(75);
    });

    it('should not call onPositionChange on mouse move without dragging', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      fireEvent.mouseMove(slider, { clientX: 150 });

      expect(defaultProps.onPositionChange).not.toHaveBeenCalled();
    });

    it('should stop dragging on mouse up', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      fireEvent.mouseDown(slider, { clientX: 100 });
      fireEvent.mouseUp(slider);
      vi.clearAllMocks();

      fireEvent.mouseMove(slider, { clientX: 150 });

      expect(defaultProps.onPositionChange).not.toHaveBeenCalled();
    });

    it('should stop dragging on mouse leave', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      fireEvent.mouseDown(slider, { clientX: 100 });
      fireEvent.mouseLeave(slider);
      vi.clearAllMocks();

      fireEvent.mouseMove(slider, { clientX: 150 });

      expect(defaultProps.onPositionChange).not.toHaveBeenCalled();
    });

    it('should clamp position to 0-100 range', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      // Click beyond right edge
      fireEvent.mouseDown(slider, { clientX: 300 });
      expect(defaultProps.onPositionChange).toHaveBeenCalledWith(100);

      vi.clearAllMocks();

      // Click before left edge
      fireEvent.mouseDown(slider, { clientX: -50 });
      expect(defaultProps.onPositionChange).toHaveBeenCalledWith(0);
    });
  });

  describe('touch interactions', () => {
    it('should call onPositionChange on touch start', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      fireEvent.touchStart(slider, {
        touches: [{ clientX: 100 }],
      });

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith(50);
    });

    it('should call onPositionChange on touch move while dragging', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      fireEvent.touchStart(slider, { touches: [{ clientX: 100 }] });
      vi.clearAllMocks();

      fireEvent.touchMove(slider, { touches: [{ clientX: 50 }] });

      expect(defaultProps.onPositionChange).toHaveBeenCalledWith(25);
    });

    it('should stop dragging on touch end', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} />);
      const slider = container.firstChild as HTMLElement;

      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        bottom: 0,
        height: 128,
        left: 0,
        right: 200,
        toJSON: () => ({}),
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      });

      fireEvent.touchStart(slider, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(slider);
      vi.clearAllMocks();

      fireEvent.touchMove(slider, { touches: [{ clientX: 50 }] });

      expect(defaultProps.onPositionChange).not.toHaveBeenCalled();
    });
  });

  describe('position styling', () => {
    it('should set clip width based on position prop', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} position={75} />);

      const clipDiv = container.querySelector('[class*="overflow-hidden pointer-events-none"]');
      expect(clipDiv).toHaveStyle({ width: '75%' });
    });

    it('should set divider position based on position prop', () => {
      const { container } = render(<ComparisonSlider {...defaultProps} position={30} />);

      const divider = container.querySelector('[class*="w-0.5 bg-white"]');
      expect(divider).toHaveStyle({ left: '30%' });
    });
  });
});
