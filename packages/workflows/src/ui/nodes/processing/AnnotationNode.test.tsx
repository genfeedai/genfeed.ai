import type { AnnotationShapeData } from '@genfeedai/contracts/types';
import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeometryEditorStore } from '../../controls/geometryEditorStore';
import { renderWithMessages } from '../../controls/testMessages';
import { useWorkflowStore } from '../../stores/workflow';
import { AnnotationNode } from './AnnotationNode';

vi.mock('../BaseNode', () => ({
  BaseNode: ({ children }: { children: ReactNode }) => (
    <div data-testid="base-node">{children}</div>
  ),
}));

const IMAGE = 'https://cdn.example.com/product.png';

const VALID_SHAPES: AnnotationShapeData[] = [
  { height: 0.4, id: 'a', kind: 'rectangle', width: 0.2, x: 0.1, y: 0.1 },
  { id: 'b', kind: 'text', text: 'Hero', x: 0.5, y: 0.5 },
];

function renderNode(
  options: { annotations?: AnnotationShapeData[]; image?: string | null } = {},
) {
  const annotations = options.annotations ?? [];
  const image = options.image === undefined ? IMAGE : options.image;
  const data = {
    annotations,
    hasAnnotations: annotations.length > 0,
    inputImage: image,
    label: 'Annotation',
    outputImage: null,
    status: 'idle',
  };
  useWorkflowStore.setState({
    getConnectedInputs: () => new Map(),
    nodes: [
      { data, id: 'node-1', position: { x: 0, y: 0 }, type: 'annotation' },
    ],
  } as never);
  return renderWithMessages(
    <AnnotationNode
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
      type="annotation"
      zIndex={0}
    />,
  );
}

describe('AnnotationNode', () => {
  beforeEach(() => {
    useGeometryEditorStore.setState({ hasAttemptedRun: false, target: null });
  });

  it('asks for an image and disables editing until one is connected', () => {
    renderNode({ image: null });

    expect(
      screen.getByRole('button', { name: 'Add annotations' }),
    ).toBeDisabled();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('opens the annotation editor for this node', () => {
    renderNode();

    fireEvent.click(screen.getByRole('button', { name: 'Add annotations' }));

    expect(useGeometryEditorStore.getState().target).toEqual({
      mode: 'annotation',
      nodeId: 'node-1',
    });
  });

  it('counts saved annotations and offers to edit them', () => {
    renderNode({ annotations: VALID_SHAPES });

    expect(screen.getByText('2 annotations')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Edit annotations' }),
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names an invalid shape on the node', () => {
    renderNode({
      annotations: [{ id: 'a', kind: 'text', text: '', x: 0.2, y: 0.2 }],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Text 1 is empty. Type its text or delete it.',
    );
  });

  it('names the first problem and counts the rest', () => {
    renderNode({
      annotations: [
        { id: 'a', kind: 'text', text: '', x: 0.2, y: 0.2 },
        { height: 0.3, id: 'b', kind: 'rectangle', width: 0.3, x: 0.9, y: 0.1 },
      ],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Text 1 is empty. Type its text or delete it. (+1 more)',
    );
  });
});
