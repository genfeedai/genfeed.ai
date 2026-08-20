'use client';

import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  extractThreadAssets,
  type ThreadAsset,
} from '@genfeedai/agent/utils/extract-thread-assets';
import { APP_ROUTES, createLibraryAssetRoute } from '@genfeedai/constants';
import { ButtonVariant, IngredientCategory } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Check,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  Paintbrush,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

type GenerationActionCanvasProps = {
  generationType: 'image' | 'video';
  /** Current card result (not yet in thread messages). */
  currentResult?: {
    id: string;
    url: string;
  } | null;
  isDisabled?: boolean;
  referenceIds: string[];
  onToggleReference: (asset: ThreadAsset) => void;
  onOpenCanvas?: () => void;
};

function libraryHref(type: 'image' | 'video', id: string): string {
  return createLibraryAssetRoute(
    type === 'video' ? IngredientCategory.VIDEO : IngredientCategory.IMAGE,
    id,
  );
}

function studioEditHref(type: 'image' | 'video', id: string): string {
  // Studio edit owns production polish; deep-link to the asset in studio context.
  return `${APP_ROUTES.STUDIO.EDIT}?${type}Id=${encodeURIComponent(id)}`;
}

export function GenerationActionCanvas({
  generationType,
  currentResult,
  isDisabled = false,
  referenceIds,
  onToggleReference,
  onOpenCanvas,
}: GenerationActionCanvasProps): ReactElement | null {
  const messages = useAgentChatStore((state) => state.messages);

  const assets = useMemo(() => {
    const fromThread = extractThreadAssets(messages).filter(
      (asset) => asset.type === generationType,
    );

    if (!currentResult?.url || !currentResult.id) {
      return fromThread;
    }

    const alreadyPresent = fromThread.some(
      (asset) =>
        asset.id === currentResult.id || asset.url === currentResult.url,
    );
    if (alreadyPresent) {
      return fromThread;
    }

    return [
      {
        id: currentResult.id,
        messageId: 'current',
        title: 'Latest generation',
        type: generationType,
        url: currentResult.url,
        thumbnailUrl: currentResult.url,
      } satisfies ThreadAsset,
      ...fromThread,
    ];
  }, [currentResult, generationType, messages]);

  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 border border-border bg-background-secondary/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <LayoutGrid className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Canvas
          </span>
          <span className="text-2xs text-muted-foreground/70">
            {assets.length} asset{assets.length === 1 ? '' : 's'}
          </span>
        </div>
        {onOpenCanvas ? (
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onOpenCanvas}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium text-primary hover:bg-primary/10"
          >
            <Paintbrush className="size-3" />
            Expand
          </Button>
        ) : null}
      </div>

      <p className="text-2xs leading-snug text-muted-foreground">
        Select assets to use as generation references, or open them to edit.
      </p>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {assets.map((asset) => {
          const isSelected = referenceIds.includes(asset.id);
          const previewUrl = asset.thumbnailUrl || asset.url;

          return (
            <div
              key={asset.id}
              className={cn(
                'group relative overflow-hidden rounded-md border bg-background',
                isSelected
                  ? 'border-primary ring-1 ring-primary/40'
                  : 'border-border',
              )}
            >
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => onToggleReference(asset)}
                className={cn(
                  'relative block aspect-square w-full overflow-hidden',
                  isDisabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer',
                )}
                aria-pressed={isSelected}
                aria-label={
                  isSelected
                    ? `Remove ${asset.title ?? 'asset'} from references`
                    : `Use ${asset.title ?? 'asset'} as reference`
                }
              >
                {asset.type === 'video' ? (
                  <video
                    src={previewUrl}
                    className="size-full object-cover"
                    muted
                    playsInline
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  <img
                    src={previewUrl}
                    alt={asset.title ?? 'Generated asset'}
                    className="size-full object-cover"
                  />
                )}
                {isSelected ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-primary/25">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" />
                    </span>
                  </span>
                ) : null}
              </button>

              <div className="flex border-t border-border">
                <a
                  href={libraryHref(generationType, asset.id)}
                  className="flex flex-1 items-center justify-center gap-0.5 px-1 py-1 text-2xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Open in library"
                >
                  <ImageIcon className="size-3" />
                  Library
                </a>
                <a
                  href={studioEditHref(generationType, asset.id)}
                  className="flex flex-1 items-center justify-center gap-0.5 border-l border-border px-1 py-1 text-2xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Open in Studio"
                >
                  <ExternalLink className="size-3" />
                  Studio
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {referenceIds.length > 0 ? (
        <p className="text-2xs text-primary">
          {referenceIds.length} reference
          {referenceIds.length === 1 ? '' : 's'} selected for next generate
        </p>
      ) : null}
    </div>
  );
}
