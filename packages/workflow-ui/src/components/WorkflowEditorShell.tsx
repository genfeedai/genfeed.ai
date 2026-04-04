'use client';

import type { WorkflowNode } from '@genfeedai/types';
import type { NodeTypes } from '@xyflow/react';
import type { ReactNode } from 'react';
import { WorkflowCanvas } from '../canvas/WorkflowCanvas';
import { NodePalette } from '../panels/NodePalette';
import { useUIStore } from '../stores/uiStore';
import { BottomBar } from '../toolbar/BottomBar';
import { SmallGraphViewportGuard } from './SmallGraphViewportGuard';

export interface WorkflowEditorShellProps {
  modalContent?: ReactNode;
  nodePalette?: ReactNode;
  nodeTypes?: NodeTypes;
  onDownloadAsZip?: (nodes: WorkflowNode[]) => void;
  rightPanel?: ReactNode;
  showBottomBar?: boolean;
  showNodePalette?: boolean;
  showSmallGraphViewportGuard?: boolean;
  toolbar: ReactNode;
}

export function WorkflowEditorShell({
  modalContent,
  nodePalette,
  nodeTypes,
  onDownloadAsZip,
  rightPanel,
  showBottomBar = true,
  showNodePalette = true,
  showSmallGraphViewportGuard = true,
  toolbar,
}: WorkflowEditorShellProps) {
  const showPalette = useUIStore((state) => state.showPalette);

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
        {toolbar}

        <div className="flex flex-1 overflow-hidden">
          {showNodePalette && (
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                showPalette ? 'w-64 opacity-100' : 'w-0 opacity-0'
              }`}
            >
              {nodePalette ?? <NodePalette />}
            </div>
          )}

          <div className="relative flex-1">
            {showSmallGraphViewportGuard && <SmallGraphViewportGuard />}
            <WorkflowCanvas
              nodeTypes={nodeTypes}
              onDownloadAsZip={onDownloadAsZip}
            />
            {showBottomBar && <BottomBar />}
          </div>

          {rightPanel}
        </div>
      </main>

      {modalContent}
    </>
  );
}
