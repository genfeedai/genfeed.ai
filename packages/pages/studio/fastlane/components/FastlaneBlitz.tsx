'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { FastlaneAssetItem } from '@genfeedai/interfaces';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { useEffect, useState } from 'react';

interface FastlaneBlitzProps {
  assets: FastlaneAssetItem[];
  failedCount: number;
  isGenerating: boolean;
  onApprove: (ideaId: string) => void;
  onReject: (ideaId: string) => void;
  onDone: () => void;
}

export default function FastlaneBlitz({
  assets,
  failedCount,
  isGenerating,
  onApprove,
  onReject,
  onDone,
}: FastlaneBlitzProps) {
  const readyAssets = assets.filter((a) => a.status === 'ready');
  const approvedCount = assets.filter((a) => a.status === 'approved').length;
  const rejectedCount = assets.filter((a) => a.status === 'rejected').length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);

  const currentAsset = readyAssets[currentIndex] ?? null;
  const isExhausted = currentIndex >= readyAssets.length;

  function triggerSwipe(dir: 'left' | 'right') {
    if (!currentAsset || swipeDir) return;
    setSwipeDir(dir);
    setTimeout(() => {
      if (dir === 'right') {
        onApprove(currentAsset.idea.id);
      } else {
        onReject(currentAsset.idea.id);
      }
      setCurrentIndex((i) => i + 1);
      setSwipeDir(null);
    }, 250);
  }

  // Keyboard left/right arrow support
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') triggerSwipe('right');
      if (e.key === 'ArrowLeft') triggerSwipe('left');
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAsset, swipeDir]);

  if (isGenerating && readyAssets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="gen-dot gen-dot-processing" />
        <p className="text-sm text-muted-foreground">Generating your assets…</p>
        {failedCount > 0 && (
          <Badge variant="destructive">{failedCount} failed</Badge>
        )}
      </div>
    );
  }

  if (isExhausted) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <h3 className="gen-heading-md">Review complete</h3>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{approvedCount} approved</span>
          <span>{rejectedCount} rejected</span>
          {failedCount > 0 && (
            <Badge variant="destructive">{failedCount} failed</Badge>
          )}
        </div>
        {approvedCount > 0 ? (
          <Button
            variant={ButtonVariant.DEFAULT}
            label="Schedule approved"
            onClick={onDone}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No assets approved. Go back to generate more ideas.
          </p>
        )}
      </div>
    );
  }

  const swipeStyle: React.CSSProperties =
    swipeDir === 'right'
      ? {
          transform: 'translateX(120%) rotate(15deg)',
          opacity: 0,
          transition: 'transform 250ms ease, opacity 250ms ease',
        }
      : swipeDir === 'left'
        ? {
            transform: 'translateX(-120%) rotate(-15deg)',
            opacity: 0,
            transition: 'transform 250ms ease, opacity 250ms ease',
          }
        : {
            transform: 'translateX(0) rotate(0deg)',
            opacity: 1,
            transition: 'transform 250ms ease, opacity 250ms ease',
          };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
      {failedCount > 0 && (
        <Badge variant="destructive">{failedCount} failed</Badge>
      )}

      <p className="gen-label-sm text-muted-foreground">
        {currentIndex + 1} / {readyAssets.length} — ← reject · approve →
      </p>

      {/* Card */}
      <div className="relative w-full" style={{ minHeight: 420 }}>
        <div
          className="gen-glass rounded-2xl overflow-hidden w-full absolute inset-0"
          style={swipeStyle}
        >
          {currentAsset?.thumbnailUrl || currentAsset?.ingredientUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentAsset.thumbnailUrl ?? currentAsset.ingredientUrl}
              alt={currentAsset.idea.hook}
              className="w-full h-64 object-cover"
            />
          ) : (
            <div className="w-full h-64 bg-muted flex items-center justify-center">
              <Badge variant="secondary">
                {currentAsset?.idea.format ?? 'asset'}
              </Badge>
            </div>
          )}

          <div className="p-4 flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{currentAsset?.idea.format}</Badge>
              {currentAsset?.idea.platformHints.map((hint: string) => (
                <Badge key={hint} variant="outline" className="text-xs">
                  {hint}
                </Badge>
              ))}
            </div>
            <p className="text-sm font-semibold">{currentAsset?.idea.hook}</p>
            <p className="text-xs text-muted-foreground line-clamp-3">
              {currentAsset?.idea.caption}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-4 mt-4" style={{ paddingTop: 420 }}>
        <Button
          variant={ButtonVariant.OUTLINE}
          size={ButtonSize.LG}
          label="✕ Reject"
          onClick={() => triggerSwipe('left')}
          isDisabled={!!swipeDir}
        />
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.LG}
          label="✓ Approve"
          onClick={() => triggerSwipe('right')}
          isDisabled={!!swipeDir}
        />
      </div>

      {isGenerating && (
        <p className="text-xs text-muted-foreground">
          More assets still generating…
        </p>
      )}
    </div>
  );
}
