'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';

import type {
  TranscribeLanguage,
  TranscribeNodeData,
} from '@genfeedai/contracts/types';
import { NodeStatusEnum } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { Checkbox } from '@genfeedai/ui/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@genfeedai/ui/primitives/select';
import type { NodeProps } from '@xyflow/react';
import {
  CircleAlert,
  Expand,
  FileText,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useExecutionStore } from '../../stores/execution';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflow';
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
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleExpand}
          title="Expand preview"
        >
          <Expand className="size-3" />
        </Button>
      ) : null,
    [nodeData.outputText, handleExpand],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="space-y-3">
        {/* Model Info */}
        <div className="text-xs text-muted-foreground">
          Using: Whisper Large V3
        </div>

        {/* Language Selection */}
        <div>
          <label
            htmlFor={`transcribe-language-${id}`}
            className="text-xs text-muted-foreground"
          >
            Language
          </label>
          <Select
            value={nodeData.language}
            onValueChange={handleLanguageChange}
          >
            <SelectTrigger
              id={`transcribe-language-${id}`}
              className="nodrag h-8 w-full"
            >
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
            className="text-xs text-muted-foreground cursor-pointer"
          >
            Include timestamps
          </label>
        </div>

        {/* Output Transcript */}
        {nodeData.outputText && (
          <div className="relative">
            <div className="p-2 bg-background border border-border rounded text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">
              {nodeData.outputText}
            </div>
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              onClick={handleTranscribe}
              disabled={nodeData.status === 'processing'}
              className={
                'absolute top-1 right-1 size-6 bg-black/50 hover:bg-black/70' /* design-system-allow-content-color */
              }
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>
        )}

        {/* Transcribe Button */}
        {!nodeData.outputText && (
          <Button
            withWrapper={false}
            variant={
              canGenerate ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
            }
            size={ButtonSize.SM}
            onClick={handleTranscribe}
            disabled={!canGenerate || nodeData.status === 'processing'}
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Transcribing...'
              : 'Transcribe'}
          </Button>
        )}

        {/* Help text for required inputs */}
        {!canGenerate && nodeData.status !== 'processing' && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <CircleAlert className="size-3" />
            Connect video or audio to transcribe
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const TranscribeNode = memo(TranscribeNodeComponent);
