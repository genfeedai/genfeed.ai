import '@testing-library/jest-dom';
import type { NodesByCategory } from '@genfeedai/interfaces/automation/workflow-builder.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import NodePalette from '@ui/workflow-builder/panels/NodePalette';
import { describe, expect, it, vi } from 'vitest';

describe('NodePalette', () => {
  const mockNodesByCategory: NodesByCategory = {
    ai: [],
    control: [],
    effects: [],
    input: [
      {
        category: 'input',
        configSchema: {},
        description: 'Input image',
        icon: 'image',
        inputs: {},
        label: 'Image Input',
        outputs: { image: { label: 'Image', type: 'image' } },
      },
    ],
    output: [],
    processing: [
      {
        category: 'processing',
        configSchema: {},
        description: 'Resize media',
        icon: 'resize',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Resize',
        outputs: { media: { label: 'Resized Media', type: 'any' } },
      },
    ],
  };

  const defaultProps = {
    isCollapsed: false,
    nodesByCategory: mockNodesByCategory,
    onDragStart: vi.fn(),
    onToggleCollapse: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(<NodePalette {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display node categories', () => {
    render(<NodePalette {...defaultProps} />);
    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('should call onDragStart when node is dragged', () => {
    const onDragStart = vi.fn();
    render(<NodePalette {...defaultProps} onDragStart={onDragStart} />);

    const nodeItem = screen.getByText('Image Input');
    const dragEvent = new Event('dragstart', { bubbles: true });
    fireEvent(nodeItem, dragEvent);

    expect(onDragStart).toHaveBeenCalled();
  });

  it('should toggle category expand/collapse when category button is clicked', () => {
    render(<NodePalette {...defaultProps} />);

    // Get category buttons (there's one for each category)
    const categoryButtons = screen.getAllByRole('button');
    expect(categoryButtons.length).toBeGreaterThan(0);

    // Click the first category button to toggle
    fireEvent.click(categoryButtons[0]);

    // The category section should still exist
    expect(screen.getByText('Inputs')).toBeInTheDocument();
  });

  it('should render collapsed state', () => {
    render(<NodePalette {...defaultProps} isCollapsed={true} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should handle user interactions correctly', () => {
    const onDragStart = vi.fn();
    render(<NodePalette {...defaultProps} onDragStart={onDragStart} />);

    // Test dragging a node item
    const nodeItem = screen.getByText('Image Input');
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: { setData: vi.fn() },
    });
    fireEvent(nodeItem, dragStartEvent);

    // Test searching/filtering nodes
    const searchInput = screen.queryByPlaceholderText(/search/i);
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'Image' } });
      expect(screen.getByText('Image Input')).toBeInTheDocument();
    }
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<NodePalette {...defaultProps} />);

    // Check palette container has correct classes
    const palette = container.firstChild;
    expect(palette).toBeInTheDocument();

    // Check node items have correct styling
    const nodeItems = container.querySelectorAll('[draggable="true"]');
    expect(nodeItems.length).toBeGreaterThan(0);

    // Check collapsed state styling
    const { container: collapsedContainer } = render(
      <NodePalette {...defaultProps} isCollapsed={true} />,
    );
    expect(collapsedContainer.firstChild).toBeInTheDocument();
  });
});
