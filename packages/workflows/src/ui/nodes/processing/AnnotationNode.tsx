'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AnnotationNodeData } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import type { NodeProps } from '@xyflow/react';
import { Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';
import { readShapes } from '../../../engine/utils/geometry';
import GeometryThumb from '../../controls/GeometryThumb';
import GroupedControls from '../../controls/GroupedControls';
import { useGeometryEditorStore } from '../../controls/geometryEditorStore';
import { useAnnotationControlGroups } from '../../controls/nodeControlGroups';
import { useNodeImage } from '../../controls/useNodeImage';
import { useUIStore } from '../../stores/uiStore';
import { BaseNode } from '../BaseNode';

function AnnotationNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as AnnotationNodeData;
  const translate = useTranslations('pages.workflows.nodeControls');
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const openEditor = useGeometryEditorStore((state) => state.openEditor);
  const inputImage = useNodeImage(id);
  const annotations = useMemo(
    () => readShapes(nodeData.annotations),
    [nodeData.annotations],
  );
  const { groups } = useAnnotationControlGroups({
    annotations,
    hasImage: inputImage !== null,
    onEdit: () => openEditor({ mode: 'annotation', nodeId: id }),
    scope: 'node',
  });

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const headerActions = useMemo(
    () =>
      inputImage ? (
        <Button
          ariaLabel={translate('expandPreview')}
          icon={<Expand className="size-3.5" />}
          onClick={handleExpand}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      ) : null,
    [inputImage, handleExpand, translate],
  );

  return (
    <BaseNode
      {...props}
      headerActions={headerActions}
      minHeight={240}
      minWidth={300}
    >
      <div className="nodrag nopan nowheel flex flex-col gap-3 px-0.5">
        {inputImage ? (
          <GeometryThumb shapes={annotations} src={inputImage} />
        ) : null}
        <GroupedControls
          groups={groups}
          idPrefix={`node-${id}-`}
          onChange={() => undefined}
          values={{}}
        />
      </div>
    </BaseNode>
  );
}

export const AnnotationNode = memo(AnnotationNodeComponent);
