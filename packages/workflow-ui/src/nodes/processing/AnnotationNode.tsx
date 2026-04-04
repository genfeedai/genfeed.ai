'use client';

import type { AnnotationNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Expand, Pencil, Shapes } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useMemo } from 'react';
import { useAnnotationStore } from '../../stores/annotationStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';

function AnnotationNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as AnnotationNodeData;
  const openAnnotation = useAnnotationStore((state) => state.openAnnotation);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const getConnectedInputs = useWorkflowStore(
    (state) => state.getConnectedInputs,
  );

  // Get the input image from connections
  const connectedInputs = getConnectedInputs(id);
  const inputImage =
    (connectedInputs.get('image') as string) ?? nodeData.inputImage;

  const handleEditAnnotations = useCallback(() => {
    if (!inputImage) return;

    // Convert stored annotations to the format expected by the annotation store
    const shapes =
      nodeData.annotations?.map((ann) => ({
        fillColor: ann.fillColor,
        id: ann.id,
        strokeColor: ann.strokeColor,
        strokeWidth: ann.strokeWidth,
        type: ann.type,
        ...ann.props,
      })) ?? [];

    openAnnotation(
      id,
      inputImage,
      shapes as Parameters<typeof openAnnotation>[2],
    );
  }, [id, inputImage, nodeData.annotations, openAnnotation]);

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const headerActions = useMemo(
    () =>
      inputImage ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleExpand}
          title="Expand preview"
        >
          <Expand className="h-3 w-3" />
        </Button>
      ) : null,
    [inputImage, handleExpand],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="flex flex-col gap-3">
        {/* Preview */}
        {inputImage ? (
          <div className="relative">
            <Image
              src={inputImage}
              alt="Input image"
              width={200}
              height={128}
              className="h-32 w-full rounded-md object-cover"
              unoptimized
            />
            {nodeData.hasAnnotations && (
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground">
                <Shapes className="h-3 w-3" />
                {nodeData.annotations?.length ?? 0}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-32 flex-col items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground">
            <Pencil className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-xs">Connect an image</p>
          </div>
        )}

        {/* Edit Button */}
        <Button
          onClick={handleEditAnnotations}
          disabled={!inputImage}
          className="w-full"
          variant={nodeData.hasAnnotations ? 'default' : 'outline'}
        >
          <Pencil className="mr-2 h-4 w-4" />
          {nodeData.hasAnnotations ? 'Edit Annotations' : 'Add Annotations'}
        </Button>

        {/* Annotation Count */}
        {nodeData.hasAnnotations && (
          <p className="text-center text-xs text-muted-foreground">
            {nodeData.annotations?.length ?? 0} annotation
            {(nodeData.annotations?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </BaseNode>
  );
}

export const AnnotationNode = memo(AnnotationNodeComponent);
