'use client';

import { createBrandAppRoute } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import type { IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import { useMoodBoard } from '@hooks/data/content/use-mood-board/use-mood-board';
import { useBrandMediaAssets } from '@hooks/data/moodboard/use-brand-media-assets/use-brand-media-assets';
import { Button } from '@ui/primitives/button';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import MoodBoardCanvas from '@/features/moodboard/MoodBoardCanvas';
import type { CanvasMessageProps } from '@/features/moodboard/moodboard.types';
import { useMoodBoardCanvas } from '@/features/moodboard/use-mood-board-canvas';

function CanvasMessage({
  title,
  children,
}: CanvasMessageProps): React.JSX.Element {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background gen-grain gen-vignette">
      <p className="text-base font-medium text-foreground/85">{title}</p>
      {children}
    </div>
  );
}

export default function MoodBoardCanvasClient(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ orgSlug: string; brandSlug: string }>();

  const {
    assets,
    isLoading: isAssetsLoading,
    isTruncated,
  } = useBrandMediaAssets();
  const { board, isLoading: isBoardLoading, save } = useMoodBoard();

  const savedLayout = useMemo<IMoodBoardLayoutItem[]>(
    () => board?.layout ?? [],
    [board?.layout],
  );

  const handlePersist = useCallback(
    (layout: IMoodBoardLayoutItem[]) => {
      void save(layout);
    },
    [save],
  );

  const { nodes, onNodesChange, onNodeDragStop } = useMoodBoardCanvas({
    assets,
    savedLayout,
    onPersist: handlePersist,
  });

  const handleClose = useCallback(() => {
    const { orgSlug, brandSlug } = params;
    if (orgSlug && brandSlug) {
      router.push(createBrandAppRoute(orgSlug, brandSlug, '/library/images'));
      return;
    }
    router.back();
  }, [params, router]);

  if (isAssetsLoading || isBoardLoading) {
    return <CanvasMessage title="Gathering your assets…" />;
  }

  if (assets.length === 0) {
    return (
      <CanvasMessage title="No assets to arrange yet">
        <Button
          variant={ButtonVariant.OUTLINE}
          label="Back to library"
          onClick={handleClose}
        />
      </CanvasMessage>
    );
  }

  return (
    <div className="h-screen w-full">
      <MoodBoardCanvas
        assets={assets}
        nodes={nodes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onClose={handleClose}
        isTruncated={isTruncated}
      />
    </div>
  );
}
