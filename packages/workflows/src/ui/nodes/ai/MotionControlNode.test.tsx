import type { TrajectoryPoint } from '@genfeedai/contracts/types';
import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeometryEditorStore } from '../../controls/geometryEditorStore';
import { renderWithMessages } from '../../controls/testMessages';
import { useWorkflowStore } from '../../stores/workflow';
import { MotionControlNode } from './MotionControlNode';

const generations: string[] = [];
const toasts: string[] = [];

vi.mock('../BaseNode', () => ({
  BaseNode: ({
    children,
    headerActions,
  }: {
    children: ReactNode;
    headerActions?: ReactNode;
  }) => (
    <div>
      {headerActions}
      {children}
    </div>
  ),
}));

vi.mock('../../hooks/useNodeExecution', () => ({
  useNodeExecution: () => ({
    handleGenerate: () => generations.push('generate'),
    handleStop: () => undefined,
  }),
}));

vi.mock('../../hooks/useCanGenerate', () => ({
  useCanGenerate: () => ({ canGenerate: true }),
}));

vi.mock('@genfeedai/ui/primitives/toaster', () => ({
  toast: { error: (message: string) => toasts.push(message) },
}));

const IMAGE = 'https://cdn.example.com/product.png';

function renderNode(trajectoryPoints: TrajectoryPoint[], mode = 'trajectory') {
  const data = {
    aspectRatio: '16:9',
    cameraIntensity: 50,
    cameraMovement: 'static',
    characterOrientation: 'image',
    duration: 5,
    inputImage: IMAGE,
    keepOriginalSound: true,
    label: 'Motion Control',
    mode,
    motionStrength: 60,
    outputVideo: null,
    qualityMode: 'pro',
    status: 'idle',
    trajectoryPoints,
  };
  useWorkflowStore.setState({
    getConnectedInputs: () => new Map(),
    nodes: [
      { data, id: 'node-1', position: { x: 0, y: 0 }, type: 'motionControl' },
    ],
  } as never);
  return renderWithMessages(
    <MotionControlNode
      data={data}
      deletable
      draggable
      dragging={false}
      id="node-1"
      isConnectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      selectable
      selected={false}
      type="motionControl"
      zIndex={0}
    />,
  );
}

describe('MotionControlNode', () => {
  beforeEach(() => {
    generations.length = 0;
    toasts.length = 0;
    useGeometryEditorStore.setState({ hasAttemptedRun: false, target: null });
  });

  it('offers to draw a trajectory and opens the editor for this node', () => {
    renderNode([]);

    expect(screen.getByText('No path drawn yet')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Draw trajectory' }));

    expect(useGeometryEditorStore.getState().target).toEqual({
      mode: 'trajectory',
      nodeId: 'node-1',
    });
  });

  it('summarizes a saved path', () => {
    renderNode([
      { frame: 0, x: 0.1, y: 0.1 },
      { frame: 119, x: 0.8, y: 0.6 },
    ]);

    expect(screen.getByText('2 points · 5 s · 120 frames')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Edit trajectory' }),
    ).toBeTruthy();
  });

  it('refuses to generate a trajectory, and still says what is wrong with an empty path', () => {
    renderNode([]);

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(generations).toEqual([]);
    expect(toasts).toEqual([
      'Run blocked. Motion Control: Only video transfer runs today. Switch the mode to video transfer.',
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The path needs at least 2 points.',
    );
  });

  it('refuses a point outside the image', () => {
    renderNode([
      { frame: 0, x: 0.1, y: 0.1 },
      { frame: 119, x: 1.2, y: 0.6 },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(generations).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Point 2 extends outside the image.',
    );
  });

  it('refuses a valid trajectory path, because only video transfer runs', () => {
    renderNode([
      { frame: 0, x: 0.1, y: 0.1 },
      { frame: 119, x: 0.8, y: 0.6 },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(generations).toEqual([]);
    expect(toasts).toEqual([
      'Run blocked. Motion Control: Only video transfer runs today. Switch the mode to video transfer.',
    ]);
  });

  it('refuses camera mode, because only video transfer runs', () => {
    renderNode([], 'camera');

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(generations).toEqual([]);
    expect(toasts).toHaveLength(1);
  });

  it('generates in video transfer mode without a path', () => {
    renderNode([], 'video_transfer');

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(generations).toEqual(['generate']);
    expect(toasts).toEqual([]);
  });
});
