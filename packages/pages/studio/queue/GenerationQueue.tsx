'use client';

import { ButtonSize, ButtonVariant, IngredientStatus } from '@genfeedai/enums';
import type { GenerationQueueProps } from '@props/studio/studio.props';
import { Button } from '@ui/primitives/button';
import { useEffect, useRef, useState } from 'react';
import { HiCheckCircle, HiClock, HiXCircle, HiXMark } from 'react-icons/hi2';

const FIVE_SECONDS_MS = 5_000;
const ONE_MINUTE_MS = 60_000;

const STATUS_BACKGROUNDS: Record<IngredientStatus, string> = {
  [IngredientStatus.DRAFT]: 'bg-muted/50',
  [IngredientStatus.PROCESSING]: 'bg-blue-500/10',
  [IngredientStatus.GENERATED]: 'bg-green-500/10',
  [IngredientStatus.VALIDATED]: 'bg-green-500/10',
  [IngredientStatus.UPLOADED]: 'bg-green-500/10',
  [IngredientStatus.FAILED]: 'bg-red-500/10',
  [IngredientStatus.ARCHIVED]: 'bg-muted/50',
  [IngredientStatus.REJECTED]: 'bg-red-500/10',
};

function getStatusBackground(status: string[]): string {
  for (const s of status) {
    const bg = STATUS_BACKGROUNDS[s as IngredientStatus];
    if (bg) {
      return bg;
    }
  }
  return 'bg-red-500/10';
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatEtaDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatEtaRange(durationMs: number): string {
  const lowerBound = Math.max(FIVE_SECONDS_MS, Math.round(durationMs * 0.7));
  const upperBound = Math.round(durationMs * 1.35);

  if (upperBound < ONE_MINUTE_MS) {
    return `${Math.round(lowerBound / 1000)}-${Math.round(upperBound / 1000)}s`;
  }

  return `${Math.round(lowerBound / ONE_MINUTE_MS)}-${Math.round(
    upperBound / ONE_MINUTE_MS,
  )} min`;
}

function getElapsedTimesForGenerations(
  generations: GenerationQueueProps['generations'],
): Record<string, number> {
  const nextElapsedTimes: Record<string, number> = {};

  for (const generation of generations) {
    if (
      generation.status.includes(IngredientStatus.PROCESSING) &&
      generation.startTime
    ) {
      nextElapsedTimes[generation.id] = Math.floor(
        (Date.now() - new Date(generation.startTime).getTime()) / 1000,
      );
    }
  }

  return nextElapsedTimes;
}

function getEtaLabel(
  gen: GenerationQueueProps['generations'][number],
): string | null {
  if (!gen.estimatedDurationMs) {
    return null;
  }

  if (gen.etaConfidence === 'low') {
    return `Usually ${formatEtaRange(gen.estimatedDurationMs)}`;
  }

  return `About ${formatEtaDuration(
    gen.remainingDurationMs ?? gen.estimatedDurationMs,
  )} left`;
}

export default function GenerationQueue({
  generations,
  onRemove,
  onClose,
}: GenerationQueueProps): React.ReactNode {
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>(() =>
    getElapsedTimesForGenerations(generations),
  );
  const generationsRef = useRef(generations);
  generationsRef.current = generations;

  useEffect(() => {
    setElapsedTimes(getElapsedTimesForGenerations(generations));
  }, [generations]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTimes(getElapsedTimesForGenerations(generationsRef.current));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (generations.length === 0) {
    return null;
  }

  const activeCount = generations.filter((g) =>
    g.status.includes(IngredientStatus.PROCESSING),
  ).length;

  return (
    <div className="absolute top-4 right-4 bg-card shadow-xl border border-white/[0.08] p-3 max-w-sm z-50">
      <div className="text-sm font-semibold mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HiClock className="w-4 h-4" />
          <span>Generation Queue ({activeCount} active)</span>
        </div>
        {onClose && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            ariaLabel="Close generation queue"
            onClick={onClose}
          >
            <HiXMark className="w-4 h-4" />
          </Button>
        )}
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {generations.map((gen) => {
          const isProcessing = gen.status.includes(IngredientStatus.PROCESSING);
          const isGenerated = gen.status.includes(IngredientStatus.GENERATED);
          const isFailed = gen.status.includes(IngredientStatus.FAILED);
          const canRemove = (isGenerated || isFailed) && onRemove;
          const etaLabel = getEtaLabel(gen);
          const actualDurationLabel =
            !isProcessing && gen.startTime
              ? formatEtaDuration(
                  Math.max(
                    1_000,
                    Date.now() - new Date(gen.startTime).getTime(),
                  ),
                )
              : null;

          return (
            <div
              key={gen.id}
              className={`flex items-center gap-2 p-2 text-xs ${getStatusBackground(gen.status)}`}
            >
              <div className="flex-1">
                <div className="font-medium truncate">
                  {gen.prompt || `${gen.type} generation`}
                </div>
                <div className="text-xs opacity-70">
                  {gen.model || 'Default model'}
                </div>
                {gen.currentPhase && (
                  <div className="mt-1 text-[11px] opacity-70">
                    {gen.currentPhase}
                  </div>
                )}
                {isProcessing && (
                  <div className="mt-1 text-[11px] opacity-70">
                    {etaLabel ?? 'Processing...'}
                  </div>
                )}
                {!isProcessing && actualDurationLabel && (
                  <div className="mt-1 text-[11px] opacity-70">
                    {isGenerated
                      ? `Completed in ${actualDurationLabel}`
                      : `Failed after ${actualDurationLabel}`}
                  </div>
                )}
                {isProcessing &&
                  (gen.remainingDurationMs ?? gen.estimatedDurationMs ?? 0) >=
                    60_000 && (
                    <div className="mt-1 text-[11px] opacity-60">
                      You can keep working. We’ll notify you when it’s ready.
                    </div>
                  )}
              </div>
              <div className="flex items-center gap-2">
                {isProcessing && (
                  <>
                    <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs">
                      {formatTime(elapsedTimes[gen.id] || 0)} elapsed
                    </span>
                  </>
                )}
                {isGenerated && (
                  <HiCheckCircle className="w-4 h-4 text-green-500" />
                )}
                {isFailed && <HiXCircle className="w-4 h-4 text-red-500" />}
              </div>
              {canRemove && (
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  onClick={() => onRemove(gen.id)}
                  ariaLabel="Remove from queue"
                >
                  ×
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
