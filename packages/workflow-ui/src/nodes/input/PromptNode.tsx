'use client';

import type { IPrompt, PromptNodeData } from '@genfeedai/types';
import { Textarea } from '@genfeedai/ui';
import type { NodeProps } from '@xyflow/react';
import { Expand, Save } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useWorkflowUIConfig } from '../../provider';
import { usePromptEditorStore } from '../../stores/promptEditorStore';
import { usePromptLibraryStore } from '../../stores/promptLibraryStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';

function PromptNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as PromptNodeData;
  const { PromptPicker } = useWorkflowUIConfig();
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const { openCreateModal } = usePromptLibraryStore();
  const { openEditor } = usePromptEditorStore();

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData<PromptNodeData>(id, { prompt: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleSelectFromLibrary = useCallback(
    (item: IPrompt) => {
      updateNodeData<PromptNodeData>(id, { prompt: item.promptText });
    },
    [id, updateNodeData],
  );

  const handleSaveToLibrary = useCallback(() => {
    if (!nodeData.prompt) return;
    openCreateModal({
      _id: '',
      category: 'custom' as never,
      createdAt: '',
      description: '',
      isDeleted: false,
      isFeatured: false,
      isSystem: false,
      name: '',
      promptText: nodeData.prompt,
      styleSettings: {},
      tags: [],
      updatedAt: '',
      useCount: 0,
    });
  }, [nodeData.prompt, openCreateModal]);

  const handleExpand = useCallback(() => {
    openEditor(id, nodeData.prompt ?? '');
  }, [id, nodeData.prompt, openEditor]);

  const titleElement = PromptPicker ? (
    <PromptPicker onSelect={handleSelectFromLibrary} label="Prompt" />
  ) : (
    <span className="text-xs font-medium">Prompt</span>
  );

  const headerActions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleExpand}
        title="Expand editor"
      >
        <Expand className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleSaveToLibrary}
        disabled={!nodeData.prompt}
        title="Save to library"
      >
        <Save className="w-3.5 h-3.5" />
      </Button>
    </>
  );

  return (
    <BaseNode
      {...props}
      titleElement={titleElement}
      headerActions={headerActions}
    >
      <Textarea
        value={nodeData.prompt || ''}
        onChange={handlePromptChange}
        placeholder="Enter your prompt..."
        className="nodrag nopan w-full flex-1 min-h-[80px] resize-none"
      />
    </BaseNode>
  );
}

export const PromptNode = memo(PromptNodeComponent);
