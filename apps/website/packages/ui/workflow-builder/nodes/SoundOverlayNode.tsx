'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Input } from '@ui/primitives/input';
import { Slider } from '@ui/primitives/slider';
import type {
  MixMode,
  SoundOverlayNodeData,
} from '@ui/workflow-builder/types/workflow-saas.types';
import { Loader2, Music, Video, Volume2 } from 'lucide-react';
import { memo, useCallback } from 'react';

export type { MixMode, SoundOverlayNodeData };

interface SoundOverlayNodeProps {
  id: string;
  data: SoundOverlayNodeData;
  onUpdate: (id: string, data: Partial<SoundOverlayNodeData>) => void;
  onExecute: (id: string) => void;
}

const MIX_MODES: { value: MixMode; label: string; desc: string }[] = [
  { desc: 'Replace video audio entirely', label: 'Replace', value: 'replace' },
  { desc: 'Blend both audio tracks', label: 'Mix', value: 'mix' },
  {
    desc: 'Sound as background music',
    label: 'Background',
    value: 'background',
  },
];

function SoundOverlayNodeComponent({
  id,
  data,
  onUpdate,
  onExecute,
}: SoundOverlayNodeProps) {
  const handleMixModeChange = useCallback(
    (mixMode: MixMode) => {
      onUpdate(id, { mixMode });
    },
    [id, onUpdate],
  );

  const handleFadeInChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(id, { fadeIn: parseFloat(e.target.value) || 0 });
    },
    [id, onUpdate],
  );

  const handleFadeOutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(id, { fadeOut: parseFloat(e.target.value) || 0 });
    },
    [id, onUpdate],
  );

  const handleProcess = useCallback(() => {
    onExecute(id);
  }, [id, onExecute]);

  const isProcessing = data.status === WorkflowNodeStatus.PROCESSING;
  const hasInputs = data.videoUrl && data.soundUrl;

  return (
    <div className="space-y-3">
      {/* Input Status */}
      <div className="space-y-2">
        <div
          className={`flex items-center gap-2 p-2 border ${
            data.videoUrl
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-background border-white/[0.08]'
          }`}
        >
          <Video className="w-4 h-4" />
          <span className="text-sm">
            {data.videoUrl ? 'Video connected' : 'Awaiting video input'}
          </span>
        </div>
        <div
          className={`flex items-center gap-2 p-2 border ${
            data.soundUrl
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-background border-white/[0.08]'
          }`}
        >
          <Music className="w-4 h-4" />
          <span className="text-sm">
            {data.soundUrl ? 'Audio connected' : 'Awaiting audio input'}
          </span>
        </div>
      </div>

      {/* Mix Mode */}
      <div>
        <label className="text-xs text-muted-foreground">Mix Mode</label>
        <div className="space-y-1 mt-1">
          {MIX_MODES.map((m) => (
            <Button
              key={m.value}
              onClick={() => handleMixModeChange(m.value)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className={`w-full p-2 text-left border transition ${
                data.mixMode === m.value
                  ? 'border-primary bg-primary/10'
                  : 'border-white/[0.08] hover:border-primary/50'
              }`}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-xs text-muted-foreground">{m.desc}</div>
            </Button>
          ))}
        </div>
      </div>

      {/* Volume Controls */}
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Volume2 className="w-3 h-3" />
            Audio Volume: {data.audioVolume}%
          </label>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[data.audioVolume]}
            onValueChange={([audioVolume]) => onUpdate(id, { audioVolume })}
            className="mt-1"
          />
        </div>

        {data.mixMode !== 'replace' && (
          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Video className="w-3 h-3" />
              Video Volume: {data.videoVolume}%
            </label>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[data.videoVolume]}
              onValueChange={([videoVolume]) => onUpdate(id, { videoVolume })}
              className="mt-1"
            />
          </div>
        )}
      </div>

      {/* Fade Controls */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Fade In (s)</label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={data.fadeIn}
            onChange={handleFadeInChange}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fade Out (s)</label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={data.fadeOut}
            onChange={handleFadeOutChange}
            className="mt-1"
          />
        </div>
      </div>

      {/* Process Button */}
      <Button
        onClick={handleProcess}
        isDisabled={isProcessing || !hasInputs}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className="w-full py-2 bg-primary text-white text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
            {data.processingProgress !== null && (
              <span>({data.processingProgress}%)</span>
            )}
          </>
        ) : (
          <>
            <Volume2 className="w-4 h-4" />
            Apply Sound Overlay
          </>
        )}
      </Button>

      {/* Output */}
      {data.outputVideoUrl && (
        <div className="p-2 bg-green-500/10 border border-green-500/20">
          <div className="text-xs text-green-400 font-medium mb-1">
            Processing Complete
          </div>
          <video src={data.outputVideoUrl} controls className="w-full" />
        </div>
      )}

      {/* Error */}
      {data.error && (
        <div className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {data.error}
        </div>
      )}
    </div>
  );
}

export const SoundOverlayNode = memo(SoundOverlayNodeComponent);
