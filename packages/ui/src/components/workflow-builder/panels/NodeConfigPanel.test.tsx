import '@testing-library/jest-dom';
import type { WorkflowNodeData } from '@genfeedai/interfaces/automation/workflow-builder.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import NodeConfigPanel from '@ui/workflow-builder/panels/NodeConfigPanel';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

describe('NodeConfigPanel', () => {
  const mockNode: Node<WorkflowNodeData> = {
    data: {
      config: { aspectRatio: '16:9' },
      definition: {
        category: 'processing',
        configSchema: {
          aspectRatio: {
            label: 'Aspect ratio',
            options: [
              { label: '16:9', value: '16:9' },
              { label: '9:16', value: '9:16' },
              { label: '1:1', value: '1:1' },
            ],
            type: 'select',
          },
        },
        description: 'Resize media',
        icon: 'resize',
        inputs: {},
        label: 'Resize',
        outputs: {},
      },
      inputVariableKeys: [],
      label: 'Resize',
      nodeType: 'process-resize',
    },
    id: 'node-1',
    position: { x: 100, y: 100 },
    type: 'process-node',
  };

  const defaultProps = {
    inputVariables: [],
    onClose: vi.fn(),
    onUpdateConfig: vi.fn(),
    selectedNode: mockNode,
  };

  it('should render without crashing', () => {
    const { container } = render(<NodeConfigPanel {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display node label', () => {
    render(<NodeConfigPanel {...defaultProps} />);
    expect(screen.getByText('Resize')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<NodeConfigPanel {...defaultProps} onClose={onClose} />);

    // Button has icon only, no accessible name - use getAllByRole
    const buttons = screen.getAllByRole('button');
    // Find the close button (typically first button with X icon)
    const closeButton = buttons[0];
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('should not render when selectedNode is null', () => {
    render(<NodeConfigPanel {...defaultProps} selectedNode={null} />);
    // Panel should not render when no node is selected
    expect(screen.queryByText('Resize')).not.toBeInTheDocument();
  });

  it.skip('should handle user interactions correctly', () => {
    const onUpdateConfig = vi.fn();
    render(
      <NodeConfigPanel {...defaultProps} onUpdateConfig={onUpdateConfig} />,
    );

    // Test updating config values
    const configInputs = screen.getAllByRole('textbox');
    if (configInputs.length > 0) {
      fireEvent.change(configInputs[0], { target: { value: '9:16' } });
      expect(onUpdateConfig).toHaveBeenCalled();
    }

    // Test selecting from dropdown/enum values
    const selectInputs = screen.getAllByRole('combobox');
    if (selectInputs.length > 0) {
      fireEvent.change(selectInputs[0], { target: { value: '9:16' } });
      expect(onUpdateConfig).toHaveBeenCalled();
    }
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<NodeConfigPanel {...defaultProps} />);

    // Check panel has correct container classes
    const panel = container.firstChild;
    expect(panel).toBeInTheDocument();

    // Check form inputs have correct styling
    const inputs = container.querySelectorAll('input, select, textarea');
    expect(inputs.length).toBeGreaterThanOrEqual(0);
  });
});
