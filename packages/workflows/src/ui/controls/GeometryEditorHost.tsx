'use client';

import {
  type AnnotationNodeData,
  type MotionControlNodeData,
  NodeStatusEnum,
} from '@genfeedai/contracts/types';
import { readShapes, readTrajectoryPoints } from '../../engine/utils/geometry';
import { useWorkflowStore } from '../stores/workflow';
import GeometryEditorDialog from './GeometryEditorDialog';
import { useGeometryEditorStore } from './geometryEditorStore';

function readImage(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * Renders the geometry editor for the node a node card or the inspector asked to edit. One host
 * per editor, so opening it from either place shows the same dialog.
 */
export default function GeometryEditorHost() {
  const target = useGeometryEditorStore((state) => state.target);
  const closeEditor = useGeometryEditorStore((state) => state.closeEditor);
  const node = useWorkflowStore((state) =>
    target
      ? state.nodes.find((candidate) => candidate.id === target.nodeId)
      : undefined,
  );
  const getConnectedInputs = useWorkflowStore(
    (state) => state.getConnectedInputs,
  );
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  if (!target || !node) {
    return null;
  }

  const data = node.data as Record<string, unknown>;
  const imageSrc =
    readImage(getConnectedInputs(node.id).get('image')) ??
    readImage(data.inputImage);
  if (!imageSrc) {
    return null;
  }

  const duration = data.duration === 10 ? 10 : 5;

  return (
    <GeometryEditorDialog
      durationSeconds={duration}
      imageSrc={imageSrc}
      initialPoints={readTrajectoryPoints(data.trajectoryPoints)}
      initialShapes={readShapes(data.annotations)}
      key={`${target.nodeId}-${target.mode}`}
      mode={target.mode}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          closeEditor();
        }
      }}
      onSavePoints={(points) =>
        updateNodeData<MotionControlNodeData>(target.nodeId, {
          error: undefined,
          status: NodeStatusEnum.IDLE,
          trajectoryPoints: points,
        })
      }
      onSaveShapes={(shapes) =>
        updateNodeData<AnnotationNodeData>(target.nodeId, {
          annotations: shapes,
          error: undefined,
          hasAnnotations: shapes.length > 0,
          status: NodeStatusEnum.IDLE,
        })
      }
    />
  );
}
