'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { Button } from '@ui/primitives/button';
import { FolderOpen, ImageIcon, Music, Tv, X } from 'lucide-react';
import Image from 'next/image';
import { memo } from 'react';

interface PromptBarAttachedAssetsTrayProps {
  assets: PromptBarAttachedAsset[];
  density?: 'compact' | 'default';
  dragError?: string | null;
  isDisabled?: boolean;
  onBrowseAssets: () => void;
  onRemoveAttachedAsset: (assetId: string) => void;
}

function getAssetRoleLabel(asset: PromptBarAttachedAsset): string {
  switch (asset.role) {
    case 'startFrame':
      return 'Start frame';
    case 'endFrame':
      return 'End frame';
    case 'input':
      return 'Input';
    default:
      return 'Reference';
  }
}

function getFallbackIcon(asset: PromptBarAttachedAsset) {
  switch (asset.kind) {
    case 'video':
      return <Tv className="size-4 text-muted-foreground" />;
    case 'audio':
      return <Music className="size-4 text-muted-foreground" />;
    default:
      return <ImageIcon className="size-4 text-muted-foreground" />;
  }
}

const PromptBarAttachedAssetsTray = memo(function PromptBarAttachedAssetsTray({
  assets,
  density = 'default',
  dragError,
  isDisabled = false,
  onBrowseAssets,
  onRemoveAttachedAsset,
}: PromptBarAttachedAssetsTrayProps) {
  if (assets.length === 0 && !dragError) {
    return null;
  }

  const isCompact = density === 'compact';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className={cn(
              'inline-flex max-w-full items-center gap-2 bg-tertiary text-foreground shadow-border',
              isCompact ? 'h-9 pl-1.5 pr-1' : 'h-10 pl-1.5 pr-1',
              isDisabled && 'opacity-70',
            )}
          >
            <div
              className={cn(
                'flex shrink-0 items-center justify-center overflow-hidden bg-background/20 shadow-border',
                isCompact ? 'size-6.5' : 'size-7',
              )}
            >
              {asset.previewUrl ? (
                <Image
                  src={asset.previewUrl}
                  alt={asset.name || getAssetRoleLabel(asset)}
                  width={isCompact ? 26 : 28}
                  height={isCompact ? 26 : 28}
                  className="size-full object-cover outline-media"
                  sizes={isCompact ? '26px' : '28px'}
                />
              ) : (
                getFallbackIcon(asset)
              )}
            </div>

            <div
              className={cn(
                'min-w-0',
                isCompact ? 'max-w-[180px]' : 'max-w-[220px]',
              )}
            >
              <p
                className={cn(
                  'truncate font-medium',
                  isCompact ? 'text-xs' : 'text-sm',
                )}
              >
                {asset.name || getAssetRoleLabel(asset)}
              </p>
            </div>

            <Button
              type="button"
              variant={undefined}
              className="size-7 shrink-0 bg-transparent p-0 text-muted-foreground shadow-border hover:bg-hover hover:text-foreground"
              icon={<X className="size-3.5" />}
              onClick={() => onRemoveAttachedAsset(asset.id)}
              isDisabled={isDisabled}
              ariaLabel={`Remove ${asset.name || getAssetRoleLabel(asset)}`}
            />
          </div>
        ))}

        <Button
          type="button"
          variant={undefined}
          className={cn(
            'bg-transparent font-medium text-muted-foreground shadow-border hover:bg-hover hover:text-foreground',
            isCompact ? 'h-9 px-2.5 text-2xs' : 'h-10 px-3 text-xs',
          )}
          icon={<FolderOpen className="size-3.5" />}
          onClick={onBrowseAssets}
          isDisabled={isDisabled}
        >
          {isCompact ? 'Library' : 'Browse library'}
        </Button>
      </div>

      {dragError ? (
        <div className="mt-2 border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          {dragError}
        </div>
      ) : null}
    </div>
  );
});

export default PromptBarAttachedAssetsTray;
