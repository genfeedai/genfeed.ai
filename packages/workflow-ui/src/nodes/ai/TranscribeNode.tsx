'use client';

import type { TranscribeLanguage, TranscribeNodeData } from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  Expand,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useExecutionStore } from '../../stores/executionStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { BaseNode } from '../BaseNode';

const LANGUAGES: { value: TranscribeLanguage; label: string }[] = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Korean', value: 'ko' },
  { label: 'Portuguese', value: 'pt' },
];

function TranscribeNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as TranscribeNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  // Transcribe validates via useCanGenerate - needs video OR audio with data
  const { canGenerate } = useCanGenerate({
    nodeId: id,
    nodeType: type as 'transcribe',
  });

  const handleLanguageChange = useCallback(
    (value: string) => {
      updateNodeData<TranscribeNodeData>(id, {
        language: value as TranscribeLanguage,
      });
    },
    [id, updateNodeData],
  );

  const handleTimestampsChange = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
        updateNodeData<TranscribeNodeData>(id, { timestamps: checked });
      }
    },
    [id, updateNodeData],
  );

  const handleTranscribe = useCallback(() => {
    updateNodeData(id, { status: NodeStatusEnum.PROCESSING });
    executeNode(id);
  }, [id, executeNode, updateNodeData]);

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const headerActions = useMemo(
    () =>
      nodeData.outputText ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleExpand}
          title="Expand preview"
        >
          <Expand className="h-3 w-3" />
        </Button>
      ) : null,
    [nodeData.outputText, handleExpand],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="space-y-3">
        {/* Model Info */}
        <div className="text-xs text-[var(--muted-foreground)]">
          Using: Whisper Large V3
        </div>

        {/* Language Selection */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Language
          </label>
          <Select
            value={nodeData.language}
            onValueChange={handleLanguageChange}
          >
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timestamps Toggle */}
        <div className="flex items-center gap-2 nodrag">
          <Checkbox
            id={`timestamps-${id}`}
            checked={nodeData.timestamps}
            onCheckedChange={handleTimestampsChange}
          />
          <label
            htmlFor={`timestamps-${id}`}
            className="text-xs text-[var(--muted-foreground)] cursor-pointer"
          >
            Include timestamps
          </label>
        </div>

        {/* Output Transcript */}
        {nodeData.outputText && (
          <div className="relative">
            <div className="p-2 bg-[var(--background)] border border-[var(--border)] rounded text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">
              {nodeData.outputText}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleTranscribe}
              disabled={nodeData.status === 'processing'}
              className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Transcribe Button */}
        {!nodeData.outputText && (
          <Button
            variant={canGenerate ? 'default' : 'secondary'}
            size="sm"
            onClick={handleTranscribe}
            disabled={!canGenerate || nodeData.status === 'processing'}
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Transcribing...'
              : 'Transcribe'}
          </Button>
        )}

        {/* Help text for required inputs */}
        {!canGenerate && nodeData.status !== 'processing' && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Connect video or audio to transcribe
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const TranscribeNode = memo(TranscribeNodeComponent);
