'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { Button } from '@ui/primitives/button';
import { FolderOpen, ImageIcon, Music, Tv, X } from 'lucide-react';
import Image from 'next/image';
import { memo } from 'react';

interface PromptBarAttachedAssetsTrayProps {
  assets: PromptBarAttachedAsset[];
  unoptimizedImages?: boolean;
  density?: 'compact' | 'default';
  dragError?: string | null;
  isDisabled?: boolean;
  onBrowseAssets?: () => void;
  onRemoveAttachedAsset: (assetId: string) => void;
}

function getAssetRoleLabel(asset: PromptBarAttachedAsset): string {
  switch (asset.role) {
    case 'editSource':
      return asset.isPrimary ? 'Editing target' : 'Editing source';
    case 'editMask':
      return 'Mask';
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
  unoptimizedImages = false,
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
              'inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-border bg-tertiary pl-1 pr-0.5 text-foreground',
              isDisabled && 'opacity-70',
            )}
          >
            <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-background/20">
              {asset.previewUrl ? (
                <Image
                  src={asset.previewUrl}
                  unoptimized={unoptimizedImages}
                  alt={asset.name || getAssetRoleLabel(asset)}
                  width={24}
                  height={24}
                  className="size-full object-cover outline-media"
                  sizes="24px"
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
              <p className="truncate text-xs font-medium">
                {asset.name || getAssetRoleLabel(asset)}
              </p>
            </div>

            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              withWrapper={false}
              className="size-7 shrink-0 p-0"
              icon={<X className="size-3.5" />}
              onClick={() => onRemoveAttachedAsset(asset.id)}
              isDisabled={isDisabled}
              ariaLabel={`Remove ${asset.name || getAssetRoleLabel(asset)}`}
            />
          </div>
        ))}

        {onBrowseAssets ? (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            className="h-8 rounded-md px-2.5 text-xs"
            icon={<FolderOpen className="size-3.5" />}
            onClick={onBrowseAssets}
            isDisabled={isDisabled}
          >
            {isCompact ? 'Library' : 'Browse library'}
          </Button>
        ) : null}
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
