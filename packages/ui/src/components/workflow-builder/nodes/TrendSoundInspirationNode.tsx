'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { TrendSoundInspirationNodeData } from '@ui/workflow-builder/types/workflow-saas.types';
import { Loader2, Music, Play, TrendingUp } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

export type { TrendSoundInspirationNodeData };

interface TrendSoundInspirationNodeProps {
  id: string;
  data: TrendSoundInspirationNodeData;
  onUpdate: (id: string, data: Partial<TrendSoundInspirationNodeData>) => void;
  onExecute: (id: string) => void;
}

function TrendSoundInspirationNodeComponent({
  id,
  data,
  onUpdate,
  onExecute,
}: TrendSoundInspirationNodeProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handleUsageCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(id, { minUsageCount: parseInt(e.target.value, 10) || 0 });
    },
    [id, onUpdate],
  );

  const handleMaxDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value ? parseInt(e.target.value, 10) : null;
      onUpdate(id, { maxDuration: value });
    },
    [id, onUpdate],
  );

  const handleFetch = useCallback(() => {
    onExecute(id);
  }, [id, onExecute]);

  const handlePlayPreview = useCallback(() => {
    if (data.soundUrl) {
      const audio = new Audio(data.soundUrl);
      audio.play();
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
    }
  }, [data.soundUrl]);

  const isProcessing = data.status === WorkflowNodeStatus.PROCESSING;

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="space-y-3">
      {/* Min Usage Count */}
      <div>
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Min Usage Count
        </label>
        <Input
          type="number"
          value={data.minUsageCount}
          onChange={handleUsageCountChange}
          placeholder="10000"
          className="mt-1"
        />
        <div className="text-xs text-muted-foreground mt-1">
          Filter sounds with at least this many uses
        </div>
      </div>

      {/* Max Duration */}
      <div>
        <label className="text-xs text-muted-foreground">
          Max Duration (seconds, optional)
        </label>
        <Input
          type="number"
          value={data.maxDuration || ''}
          onChange={handleMaxDurationChange}
          placeholder="Leave empty for any"
          className="mt-1"
        />
      </div>

      {/* Fetch Button */}
      <Button
        onClick={handleFetch}
        isDisabled={isProcessing}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className="w-full py-2 bg-primary text-white text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Finding Sounds...
          </>
        ) : (
          <>
            <Music className="w-4 h-4" />
            Get Trending Sound
          </>
        )}
      </Button>

      {/* Sound Result */}
      {data.soundId && (
        <div className="p-3 bg-green-500/10 border border-green-500/20">
          <div className="flex items-start gap-3">
            {/* Cover Art */}
            {data.coverUrl && (
              <div className="w-12 h-12 overflow-hidden flex-shrink-0">
                <img
                  src={data.coverUrl}
                  alt={data.soundName || 'Sound cover'}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {data.soundName}
              </div>
              {data.authorName && (
                <div className="text-xs text-muted-foreground">
                  {data.authorName}
                </div>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {data.usageCount && (
                  <span>{formatNumber(data.usageCount)} uses</span>
                )}
                {data.duration && <span>{data.duration}s</span>}
                {data.growthRate !== null && data.growthRate > 0 && (
                  <span className="text-green-400">
                    +{data.growthRate.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Play Preview */}
          {data.soundUrl && (
            <Button
              onClick={handlePlayPreview}
              isDisabled={isPlaying}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className="w-full mt-2 py-1.5 bg-background border border-white/[0.08] text-xs flex items-center justify-center gap-1 hover:bg-border transition"
            >
              <Play className="w-3 h-3" />
              {isPlaying ? 'Playing...' : 'Preview Sound'}
            </Button>
          )}

          {/* Sound ID for reference */}
          <div className="mt-2 text-xs text-muted-foreground">
            Sound ID: {data.soundId}
          </div>
        </div>
      )}

      {/* No sound found */}
      {data.status === WorkflowNodeStatus.COMPLETE && !data.soundId && (
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
          No trending sounds found matching criteria
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

export const TrendSoundInspirationNode = memo(
  TrendSoundInspirationNodeComponent,
);
