'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AnnotationNodeData,
  MotionControlNodeData,
} from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { readShapes } from '../lib/geometry';
import { PanelContainer } from '../panels/PanelContainer';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';
import { coerceControlValue } from './controlValues';
import GroupedControls from './GroupedControls';
import { useGeometryEditorStore } from './geometryEditorStore';
import {
  useAnnotationControlGroups,
  useMotionControlGroups,
} from './nodeControlGroups';
import { useNodeImage } from './useNodeImage';

/**
 * The right-hand panel for a motion-control or annotation node. Renders nothing for any other
 * node, so it sits beside the panel for action nodes.
 */
export default function GeometryNodeInspector() {
  const selectedNodeId = useUIStore((state) => state.selectedNodeId);
  const node = useWorkflowStore((state) =>
    selectedNodeId
      ? state.nodes.find((candidate) => candidate.id === selectedNodeId)
      : undefined,
  );
  if (node?.type === 'motionControl') {
    return <MotionInspector nodeId={node.id} />;
  }
  if (node?.type === 'annotation') {
    return <AnnotationInspector nodeId={node.id} />;
  }
  return null;
}

function MotionInspector({ nodeId }: { nodeId: string }) {
  const translate = useTranslations('pages.workflows.nodeControls');
  const data = useWorkflowStore(
    (state) =>
      state.nodes.find((node) => node.id === nodeId)?.data as
        | Partial<MotionControlNodeData>
        | undefined,
  );
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const openEditor = useGeometryEditorStore((state) => state.openEditor);
  const hasAttemptedRun = useGeometryEditorStore(
    (state) => state.hasAttemptedRun,
  );
  const hasImage = useNodeImage(nodeId) !== null;
  const values = data ?? {};
  const { groups } = useMotionControlGroups({
    data: values,
    hasAttemptedRun,
    hasImage,
    onEditTrajectory: () => openEditor({ mode: 'trajectory', nodeId }),
    scope: 'inspector',
  });

  return (
    <InspectorFrame
      description={translate('motion.description')}
      title={translate('motion.title')}
    >
      <GroupedControls
        groups={groups}
        idPrefix={`inspector-${nodeId}-`}
        onChange={(field, value) =>
          updateNodeData<MotionControlNodeData>(nodeId, {
            [field]: coerceControlValue(field, value),
          })
        }
        values={values}
      />
    </InspectorFrame>
  );
}

function AnnotationInspector({ nodeId }: { nodeId: string }) {
  const translate = useTranslations('pages.workflows.nodeControls');
  const annotations = useWorkflowStore(
    (state) =>
      (
        state.nodes.find((node) => node.id === nodeId)?.data as
          | Partial<AnnotationNodeData>
          | undefined
      )?.annotations,
  );
  const openEditor = useGeometryEditorStore((state) => state.openEditor);
  const hasImage = useNodeImage(nodeId) !== null;
  const { groups } = useAnnotationControlGroups({
    annotations: readShapes(annotations),
    hasImage,
    onEdit: () => openEditor({ mode: 'annotation', nodeId }),
    scope: 'inspector',
  });

  return (
    <InspectorFrame
      description={translate('annotation.description')}
      title={translate('annotation.title')}
    >
      <GroupedControls
        groups={groups}
        idPrefix={`inspector-${nodeId}-`}
        onChange={() => undefined}
        values={{}}
      />
    </InspectorFrame>
  );
}

function InspectorFrame({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  const translate = useTranslations('pages.workflows.nodeControls');
  const selectNode = useUIStore((state) => state.selectNode);
  return (
    <PanelContainer
      aria-label={translate('inspectorLabel', { title })}
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card"
      role="complementary"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          ariaLabel={translate('closeInspector')}
          icon={<X className="size-4" />}
          onClick={() => selectNode(null)}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </PanelContainer>
  );
}
