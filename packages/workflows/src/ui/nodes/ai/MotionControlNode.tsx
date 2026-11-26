'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { MotionControlNodeData } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import type { NodeProps } from '@xyflow/react';
import {
  CircleAlert,
  Expand,
  Play,
  RefreshCw,
  Square,
  Video,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';
import { coerceControlValue } from '../../controls/controlValues';
import GeometryThumb from '../../controls/GeometryThumb';
import GroupedControls from '../../controls/GroupedControls';
import { useGeometryEditorStore } from '../../controls/geometryEditorStore';
import { useMotionControlGroups } from '../../controls/nodeControlGroups';
import { useGeometryRunGuard } from '../../controls/useGeometryRunGuard';
import { useNodeImage } from '../../controls/useNodeImage';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { modeUsesTrajectory, readTrajectoryPoints } from '../../lib/geometry';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflow';
import { BaseNode } from '../BaseNode';

function MotionOutputPreview({
  isProcessing,
  onGenerate,
  outputVideo,
}: {
  isProcessing: boolean;
  onGenerate: () => void;
  outputVideo?: string | null;
}) {
  const translate = useTranslations('pages.workflows.nodeControls.motion');
  if (!outputVideo) {
    return null;
  }

  return (
    <div className="relative">
      <VideoPlayer
        ariaLabel={translate('outputLabel')}
        className="nodrag nowheel h-20 w-full overflow-hidden rounded"
        config={{
          autoPlay: false,
          controls: true,
          loop: false,
          muted: false,
          playsInline: true,
          preload: 'metadata',
        }}
        mediaClassName="object-cover"
        src={outputVideo}
      />
      <Button
        ariaLabel={translate('regenerate')}
        className="absolute right-1 top-1 size-6"
        disabled={isProcessing}
        icon={<RefreshCw className="size-3.5" />}
        onClick={onGenerate}
        size={ButtonSize.ICON}
        variant={ButtonVariant.OVERLAY}
        withWrapper={false}
      />
    </div>
  );
}

function MotionRequirementHint({
  canGenerate,
  isProcessing,
  isVideoTransferMode,
}: {
  canGenerate: boolean;
  isProcessing: boolean;
  isVideoTransferMode: boolean;
}) {
  const translate = useTranslations('pages.workflows.nodeControls.motion');
  return (
    <>
      {!canGenerate && !isProcessing && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CircleAlert className="size-3.5" />
          {translate(isVideoTransferMode ? 'needsImageAndVideo' : 'needsImage')}
        </div>
      )}

      {isVideoTransferMode && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Video className="size-3.5" />
          {translate('videoLength')}
        </div>
      )}
    </>
  );
}

function MotionControlNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as MotionControlNodeData;
  const translate = useTranslations('pages.workflows.nodeControls');
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const openEditor = useGeometryEditorStore((state) => state.openEditor);
  const hasAttemptedRun = useGeometryEditorStore(
    (state) => state.hasAttemptedRun,
  );
  const { handleGenerate, handleStop } = useNodeExecution(id);
  const { canGenerate } = useCanGenerate({
    nodeId: id,
    nodeType: type as 'motionControl',
  });
  const checkGeometry = useGeometryRunGuard();
  const inputImage = useNodeImage(id);
  const points = useMemo(
    () => readTrajectoryPoints(nodeData.trajectoryPoints),
    [nodeData.trajectoryPoints],
  );
  const { groups } = useMotionControlGroups({
    data: nodeData,
    hasAttemptedRun,
    hasImage: inputImage !== null,
    onEditTrajectory: () => openEditor({ mode: 'trajectory', nodeId: id }),
    scope: 'node',
  });

  const handleChange = useCallback(
    (fieldId: string, value: unknown) => {
      updateNodeData<MotionControlNodeData>(id, {
        [fieldId]: coerceControlValue(fieldId, value),
      });
    },
    [id, updateNodeData],
  );

  // A run with invalid geometry is refused here, with the problem named, before anything is sent.
  const handleGenerateChecked = useCallback(() => {
    if (checkGeometry(id)) {
      handleGenerate();
    }
  }, [checkGeometry, handleGenerate, id]);

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const isVideoTransferMode = nodeData.mode === 'video_transfer';
  const isProcessing = nodeData.status === 'processing';

  const headerActions = useMemo(
    () => (
      <>
        {nodeData.outputVideo && (
          <Button
            ariaLabel={translate('expandPreview')}
            icon={<Expand className="size-3.5" />}
            onClick={handleExpand}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        )}
        {isProcessing ? (
          <Button
            icon={<Square className="size-4 fill-current" />}
            onClick={handleStop}
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.DESTRUCTIVE}
            withWrapper={false}
          >
            {translate('motion.generating')}
          </Button>
        ) : (
          <Button
            disabled={!canGenerate}
            icon={<Play className="size-4 fill-current" />}
            onClick={handleGenerateChecked}
            size={ButtonSize.SM}
            textTransform="none"
            variant={
              canGenerate ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
            }
            withWrapper={false}
          >
            {translate('motion.generate')}
          </Button>
        )}
      </>
    ),
    [
      nodeData.outputVideo,
      isProcessing,
      handleGenerateChecked,
      handleStop,
      handleExpand,
      canGenerate,
      translate,
    ],
  );

  return (
    <BaseNode
      {...props}
      headerActions={headerActions}
      hideStatusIndicator
      minHeight={260}
      minWidth={300}
    >
      <div className="nodrag nopan nowheel flex flex-col gap-3 px-0.5">
        {inputImage &&
        modeUsesTrajectory(nodeData.mode) &&
        points.length > 0 ? (
          <GeometryThumb points={points} src={inputImage} />
        ) : null}
        <GroupedControls
          groups={groups}
          idPrefix={`node-${id}-`}
          onChange={handleChange}
          values={nodeData}
        />
        <p className="text-xs text-muted-foreground">
          {translate('moreInInspector')}
        </p>
        <MotionOutputPreview
          isProcessing={isProcessing}
          onGenerate={handleGenerateChecked}
          outputVideo={nodeData.outputVideo}
        />
        <MotionRequirementHint
          canGenerate={canGenerate}
          isProcessing={isProcessing}
          isVideoTransferMode={isVideoTransferMode}
        />
      </div>
    </BaseNode>
  );
}

export const MotionControlNode = memo(MotionControlNodeComponent);
