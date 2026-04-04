'use client';

import type {
  TextToSpeechNodeData,
  TTSProvider,
  TTSVoice,
} from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  AudioLines,
  Loader2,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Slider } from '../../ui/slider';
import { BaseNode } from '../BaseNode';

const TTS_ENABLED = process.env.NEXT_PUBLIC_TTS_ENABLED === 'true';

const PROVIDERS: { value: TTSProvider; label: string }[] = [
  { label: 'ElevenLabs', value: 'elevenlabs' },
  { label: 'OpenAI', value: 'openai' },
];

const VOICES: { value: TTSVoice; label: string; description: string }[] = [
  { description: 'American female, calm', label: 'Rachel', value: 'rachel' },
  { description: 'American male, confident', label: 'Drew', value: 'drew' },
  { description: 'American male, war veteran', label: 'Clyde', value: 'clyde' },
  { description: 'American male, narrative', label: 'Paul', value: 'paul' },
  { description: 'American female, assertive', label: 'Domi', value: 'domi' },
  { description: 'British male, conversational', label: 'Dave', value: 'dave' },
  { description: 'Irish male, sailor', label: 'Fin', value: 'fin' },
  { description: 'American female, soft', label: 'Sarah', value: 'sarah' },
  { description: 'American male, friendly', label: 'Antoni', value: 'antoni' },
  { description: 'American male, calm', label: 'Thomas', value: 'thomas' },
  {
    description: 'Australian male, casual',
    label: 'Charlie',
    value: 'charlie',
  },
  { description: 'American female, calm', label: 'Emily', value: 'emily' },
  {
    description: 'British female, pleasant',
    label: 'Dorothy',
    value: 'dorothy',
  },
  { description: 'American male, deep', label: 'Josh', value: 'josh' },
  { description: 'American male, narrator', label: 'Arnold', value: 'arnold' },
  { description: 'American male, deep', label: 'Adam', value: 'adam' },
  { description: 'American male, raspy', label: 'Sam', value: 'sam' },
];

function TextToSpeechNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as TextToSpeechNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const { handleGenerate } = useNodeExecution(id);
  const { canGenerate } = useCanGenerate({
    nodeId: id,
    nodeType: type as 'textToSpeech',
  });

  const handleProviderChange = useCallback(
    (value: string) => {
      updateNodeData<TextToSpeechNodeData>(id, {
        provider: value as TTSProvider,
      });
    },
    [id, updateNodeData],
  );

  const handleVoiceChange = useCallback(
    (value: string) => {
      updateNodeData<TextToSpeechNodeData>(id, { voice: value as TTSVoice });
    },
    [id, updateNodeData],
  );

  const handleStabilityChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<TextToSpeechNodeData>(id, { stability: value });
    },
    [id, updateNodeData],
  );

  const handleSimilarityChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<TextToSpeechNodeData>(id, { similarityBoost: value });
    },
    [id, updateNodeData],
  );

  const handleSpeedChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<TextToSpeechNodeData>(id, { speed: value });
    },
    [id, updateNodeData],
  );

  const headerActions = useMemo(
    () =>
      nodeData.outputAudio ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleGenerate}
          disabled={nodeData.status === 'processing' || !canGenerate}
          title="Regenerate"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      ) : null,
    [nodeData.outputAudio, nodeData.status, canGenerate, handleGenerate],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      <div className="space-y-3">
        {/* API Key Warning */}
        {!TTS_ENABLED && (
          <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-amber-500">
              <p className="font-medium">ElevenLabs not configured</p>
              <p className="text-amber-500/80 mt-0.5">
                Set{' '}
                <code className="bg-amber-500/20 px-1 rounded">
                  ELEVENLABS_API_KEY
                </code>{' '}
                in API and{' '}
                <code className="bg-amber-500/20 px-1 rounded">
                  NEXT_PUBLIC_TTS_ENABLED=true
                </code>{' '}
                in web
              </p>
            </div>
          </div>
        )}

        {/* Provider Selection */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Provider
          </label>
          <Select
            value={nodeData.provider}
            onValueChange={handleProviderChange}
          >
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((provider) => (
                <SelectItem key={provider.value} value={provider.value}>
                  {provider.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Voice Selection */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Voice
          </label>
          <Select value={nodeData.voice} onValueChange={handleVoiceChange}>
            <SelectTrigger className="nodrag h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((voice) => (
                <SelectItem key={voice.value} value={voice.value}>
                  {voice.label} - {voice.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stability Slider */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Stability: {Math.round(nodeData.stability * 100)}%
          </label>
          <Slider
            value={[nodeData.stability]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={handleStabilityChange}
            className="nodrag w-full"
          />
          <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>Variable</span>
            <span>Stable</span>
          </div>
        </div>

        {/* Similarity Boost Slider */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Clarity: {Math.round(nodeData.similarityBoost * 100)}%
          </label>
          <Slider
            value={[nodeData.similarityBoost]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={handleSimilarityChange}
            className="nodrag w-full"
          />
          <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Speed Slider */}
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Speed: {nodeData.speed.toFixed(1)}x
          </label>
          <Slider
            value={[nodeData.speed]}
            min={0.5}
            max={2}
            step={0.1}
            onValueChange={handleSpeedChange}
            className="nodrag w-full"
          />
        </div>

        {/* Output Audio Player */}
        {nodeData.outputAudio && (
          <audio src={nodeData.outputAudio} controls className="w-full" />
        )}

        {/* Generate Button */}
        {!nodeData.outputAudio && (
          <Button
            variant={canGenerate && TTS_ENABLED ? 'default' : 'secondary'}
            size="sm"
            onClick={handleGenerate}
            disabled={
              !canGenerate || !TTS_ENABLED || nodeData.status === 'processing'
            }
            className="w-full"
          >
            {nodeData.status === 'processing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
            {nodeData.status === 'processing'
              ? 'Generating...'
              : 'Generate Speech'}
          </Button>
        )}

        {/* Help text for required input */}
        {!canGenerate && nodeData.status !== 'processing' && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AudioLines className="w-3 h-3" />
            Connect text input to generate speech
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const TextToSpeechNode = memo(TextToSpeechNodeComponent);
