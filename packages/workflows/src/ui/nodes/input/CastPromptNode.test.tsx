import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CastPromptNode } from './CastPromptNode';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../BaseNode', () => ({
  BaseNode: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="base-node">{children}</div>
  ),
}));

const mockUpdateNodeData = vi.fn();

vi.mock('../../stores/workflow', () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => {
    const state = { updateNodeData: mockUpdateNodeData };
    return selector(state);
  },
}));

describe('CastPromptNode', () => {
  const defaultProps = {
    data: {
      action: '',
      cameraMovement: 'static',
      colorPalette: '',
      family: 'ugc',
      hasStartFrameReference: false,
      label: 'CAST Prompt',
      lighting: '',
      mood: '',
      outputPrompt: null,
      presetId: 'ugc_selfie_handheld',
      status: 'idle',
      subject: '',
    },
    deletable: true,
    draggable: true,
    dragging: false,
    id: 'cast-1',
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selected: false,
    selectable: true,
    type: 'castPrompt',
    zIndex: 0,
  };

  beforeEach(() => {
    mockUpdateNodeData.mockClear();
  });

  it('displays the UGC vocabulary library for the selected preset', () => {
    render(<CastPromptNode {...defaultProps} />);

    expect(screen.getByText('Vocabulary library')).toBeInTheDocument();
    expect(
      screen.getByText('Micro-expression & presenter pacing'),
    ).toBeInTheDocument();
    expect(screen.getByText('Camera')).toBeInTheDocument();
    expect(screen.getByText('Identity lock')).toBeInTheDocument();
    expect(screen.getByText('Framing anchors')).toBeInTheDocument();
    expect(screen.getByText(/handheld selfie sway/i)).toBeInTheDocument();
    expect(screen.getByText(/eyebrow raise/i)).toBeInTheDocument();
  });

  it('updates identity-lock copy when start-frame reference is checked', () => {
    render(<CastPromptNode {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Start-frame reference'));

    expect(mockUpdateNodeData).toHaveBeenCalledWith('cast-1', {
      hasStartFrameReference: true,
    });
  });

  it('switches to the cinematic family without showing the UGC library', () => {
    render(
      <CastPromptNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          family: 'cinematic',
          presetId: 'hollywood_blockbuster',
        }}
      />,
    );

    expect(screen.queryByText('Vocabulary library')).not.toBeInTheDocument();
    expect(screen.getByText('Camera movement')).toBeInTheDocument();
  });
});
