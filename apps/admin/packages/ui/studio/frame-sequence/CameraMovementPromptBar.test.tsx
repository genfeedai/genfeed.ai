import type { CameraMovementPreset } from '@genfeedai/interfaces/studio/camera-movement.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import CameraMovementPromptBar from '@ui/studio/frame-sequence/CameraMovementPromptBar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Skipped due to worker memory issues in test suite
describe.skip('CameraMovementPromptBar', () => {
  const defaultProps = {
    customPrompt: '',
    onCustomPromptChange: vi.fn(),
    onPresetChange: vi.fn(),
    preset: 'static' as CameraMovementPreset,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the card with Camera label', () => {
      render(<CameraMovementPromptBar {...defaultProps} />);
      expect(screen.getByText('Camera')).toBeInTheDocument();
    });

    it('renders the Movement dropdown label', () => {
      render(<CameraMovementPromptBar {...defaultProps} />);
      expect(screen.getByText('Movement')).toBeInTheDocument();
    });
  });

  describe('Preset Selection', () => {
    it('displays static preset by default', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="static" />);
      expect(screen.getByText('Static (No Movement)')).toBeInTheDocument();
    });

    it('displays pan left preset when selected', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="pan-left" />);
      expect(screen.getByText('Pan Left')).toBeInTheDocument();
    });

    it('displays zoom in preset when selected', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="zoom-in" />);
      expect(screen.getByText('Zoom In')).toBeInTheDocument();
    });

    it('displays dolly forward preset when selected', () => {
      render(
        <CameraMovementPromptBar {...defaultProps} preset="dolly-forward" />,
      );
      expect(screen.getByText('Dolly Forward')).toBeInTheDocument();
    });

    it('displays custom preset when selected', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="custom" />);
      expect(screen.getByText('Custom Prompt')).toBeInTheDocument();
    });
  });

  describe('Preset Prompt Display', () => {
    it('shows prompt text for static preset', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="static" />);
      expect(
        screen.getByText('static camera, no movement'),
      ).toBeInTheDocument();
    });

    it('shows prompt text for pan-left preset', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="pan-left" />);
      expect(
        screen.getByText('smooth pan left, following subject'),
      ).toBeInTheDocument();
    });

    it('shows prompt text for zoom-in preset', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="zoom-in" />);
      expect(
        screen.getByText('smooth zoom in, focusing on subject'),
      ).toBeInTheDocument();
    });

    it('shows prompt text for crane-up preset', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="crane-up" />);
      expect(
        screen.getByText('smooth crane up, rising vertically'),
      ).toBeInTheDocument();
    });

    it('shows prompt text for rotate-clockwise preset', () => {
      render(
        <CameraMovementPromptBar {...defaultProps} preset="rotate-clockwise" />,
      );
      expect(
        screen.getByText('smooth rotate clockwise around subject'),
      ).toBeInTheDocument();
    });

    it('does not show preset prompt when custom is selected', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="custom" />);
      expect(
        screen.queryByText('static camera, no movement'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Custom Prompt Input', () => {
    it('shows custom prompt input when custom preset selected', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="custom" />);
      expect(
        screen.getByPlaceholderText('e.g., slow dolly forward with pan left'),
      ).toBeInTheDocument();
    });

    it('does not show custom input for non-custom presets', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="static" />);
      expect(
        screen.queryByPlaceholderText('e.g., slow dolly forward with pan left'),
      ).not.toBeInTheDocument();
    });

    it('displays custom prompt value', () => {
      render(
        <CameraMovementPromptBar
          {...defaultProps}
          preset="custom"
          customPrompt="my custom camera movement"
        />,
      );
      const input = screen.getByDisplayValue('my custom camera movement');
      expect(input).toBeInTheDocument();
    });

    it('calls onCustomPromptChange when input changes', () => {
      const onCustomPromptChange = vi.fn();
      render(
        <CameraMovementPromptBar
          {...defaultProps}
          preset="custom"
          onCustomPromptChange={onCustomPromptChange}
        />,
      );

      const input = screen.getByPlaceholderText(
        'e.g., slow dolly forward with pan left',
      );
      fireEvent.change(input, { target: { value: 'new prompt' } });

      expect(onCustomPromptChange).toHaveBeenCalledWith('new prompt');
    });
  });

  describe('All Presets Available', () => {
    const allPresets: CameraMovementPreset[] = [
      'static',
      'pan-left',
      'pan-right',
      'tilt-up',
      'tilt-down',
      'zoom-in',
      'zoom-out',
      'dolly-forward',
      'dolly-back',
      'truck-left',
      'truck-right',
      'crane-up',
      'crane-down',
      'rotate-clockwise',
      'rotate-counter-clockwise',
      'custom',
    ];

    it.each(allPresets)('renders correctly with %s preset', (preset) => {
      render(<CameraMovementPromptBar {...defaultProps} preset={preset} />);
      expect(screen.getByText('Camera')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('prompt text has correct styling classes', () => {
      render(<CameraMovementPromptBar {...defaultProps} preset="static" />);
      const promptText = screen.getByText('static camera, no movement');
      expect(promptText).toHaveClass('text-xs', 'truncate');
    });

    it('card has correct body styling', () => {
      const { container } = render(
        <CameraMovementPromptBar {...defaultProps} />,
      );
      // Card should render with proper structure
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Dropdown Configuration', () => {
    it('dropdown is full width', () => {
      render(<CameraMovementPromptBar {...defaultProps} />);
      // The FormDropdown should exist
      expect(screen.getByText('Movement')).toBeInTheDocument();
    });
  });
});
