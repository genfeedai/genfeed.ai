'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/contracts';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Slider } from '@ui/primitives/slider';
import Spinner from '@ui/primitives/spinner';
import type {
  MixMode,
  SoundOverlayNodeData,
} from '@ui/workflow-builder/types/workflow-saas.types';
import { Music, Video, Volume2 } from 'lucide-react';
import { memo, useCallback, useId } from 'react';

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
  const mixModeId = useId();
  const fadeInId = useId();
  const fadeOutId = useId();
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
      <div className="space-y-2">
        <div
          className={`flex items-center gap-2 p-2 border ${
            data.videoUrl
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-background border-white/10'
          }`}
        >
          <Video className="size-4" />
          <span className="text-sm">
            {data.videoUrl ? 'Video connected' : 'Awaiting video input'}
          </span>
        </div>
        <div
          className={`flex items-center gap-2 p-2 border ${
            data.soundUrl
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-background border-white/10'
          }`}
        >
          <Music className="size-4" />
          <span className="text-sm">
            {data.soundUrl ? 'Audio connected' : 'Awaiting audio input'}
          </span>
        </div>
      </div>

      {/* Mix Mode */}
      <div>
        <span id={mixModeId} className="text-xs text-muted-foreground">
          Mix Mode
        </span>
        <div
          role="group"
          aria-labelledby={mixModeId}
          className="space-y-1 mt-1"
        >
          {MIX_MODES.map((m) => (
            <Button
              key={m.value}
              onClick={() => handleMixModeChange(m.value)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className={`w-full p-2 text-left border transition ${
                data.mixMode === m.value
                  ? 'border-primary bg-primary/10'
                  : 'border-white/10 hover:border-primary/50'
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
          <Label className="text-xs text-muted-foreground flex items-center gap-1 font-normal leading-normal">
            <Volume2 className="size-3" />
            Audio Volume: {data.audioVolume}%
          </Label>
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
            <Label className="text-xs text-muted-foreground flex items-center gap-1 font-normal leading-normal">
              <Video className="size-3" />
              Video Volume: {data.videoVolume}%
            </Label>
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
          <Label
            htmlFor={fadeInId}
            className="text-xs text-muted-foreground font-normal"
          >
            Fade In (s)
          </Label>
          <Input
            id={fadeInId}
            type="number"
            min="0"
            step="0.5"
            value={data.fadeIn}
            onChange={handleFadeInChange}
            className="mt-1"
          />
        </div>
        <div>
          <Label
            htmlFor={fadeOutId}
            className="text-xs text-muted-foreground font-normal"
          >
            Fade Out (s)
          </Label>
          <Input
            id={fadeOutId}
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
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Spinner className="size-4" />
            Processing…
            {data.processingProgress !== null && (
              <span>({data.processingProgress}%)</span>
            )}
          </>
        ) : (
          <>
            <Volume2 className="size-4" />
            Apply Sound Overlay
          </>
        )}
      </Button>

      {/* Output */}
      {data.outputVideoUrl && (
        <div className="p-2 bg-green-500/10 border border-green-500/20">
          <div className="text-xs text-success font-medium mb-1">
            Processing Complete
          </div>
          <VideoPlayer
            ariaLabel="Output video"
            src={data.outputVideoUrl}
            className="aspect-video w-full"
          />
        </div>
      )}

      {/* Error */}
      {data.error && (
        <div className="p-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {data.error}
        </div>
      )}
    </div>
  );
}

export const SoundOverlayNode = memo(SoundOverlayNodeComponent);
