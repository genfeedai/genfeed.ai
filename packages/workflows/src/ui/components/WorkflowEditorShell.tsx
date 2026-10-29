'use client';

import type { WorkflowNode } from '@genfeedai/contracts/types';
import type { NodeTypes } from '@xyflow/react';
import type { ReactNode } from 'react';
import { WorkflowCanvas } from '../canvas/WorkflowCanvas';
import { BottomBar } from '../toolbar/BottomBar';
import { SmallGraphViewportGuard } from './SmallGraphViewportGuard';

export interface WorkflowEditorShellProps {
  modalContent?: ReactNode;
  nodeTypes?: NodeTypes;
  onDownloadAsZip?: (nodes: WorkflowNode[]) => void;
  rightPanel?: ReactNode;
  showBottomBar?: boolean;
  showSmallGraphViewportGuard?: boolean;
  toolbar?: ReactNode;
}

export function WorkflowEditorShell({
  modalContent,
  nodeTypes,
  onDownloadAsZip,
  rightPanel,
  showBottomBar = true,
  showSmallGraphViewportGuard = true,
  toolbar,
}: WorkflowEditorShellProps) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {toolbar}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="relative min-w-0 flex-1">
            {showSmallGraphViewportGuard && <SmallGraphViewportGuard />}
            <WorkflowCanvas
              nodeTypes={nodeTypes}
              onDownloadAsZip={onDownloadAsZip}
            />
            {showBottomBar && <BottomBar />}
          </div>

          {rightPanel}
        </div>
      </div>

      {modalContent}
    </>
  );
}
