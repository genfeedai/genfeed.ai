'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { PromptBarAttachedAsset } from '@props/studio/prompt-bar.props';
import Button from '@ui/buttons/base/Button';
import Image from 'next/image';
import { memo } from 'react';
import {
  HiMusicalNote,
  HiOutlineFolderOpen,
  HiPhoto,
  HiTv,
  HiXMark,
} from 'react-icons/hi2';

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
      return <HiTv className="h-4 w-4 text-white/70" />;
    case 'audio':
      return <HiMusicalNote className="h-4 w-4 text-white/70" />;
    default:
      return <HiPhoto className="h-4 w-4 text-white/70" />;
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
              'inline-flex max-w-full items-center gap-2 border border-white/10 bg-white/[0.04] text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
              isCompact ? 'h-9 pl-1.5 pr-1' : 'h-10 pl-1.5 pr-1',
              isDisabled && 'opacity-70',
            )}
          >
            <div
              className={cn(
                'flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-black/20',
                isCompact ? 'h-6.5 w-6.5' : 'h-7 w-7',
              )}
            >
              {asset.previewUrl ? (
                <Image
                  src={asset.previewUrl}
                  alt={asset.name || getAssetRoleLabel(asset)}
                  width={isCompact ? 26 : 28}
                  height={isCompact ? 26 : 28}
                  className="h-full w-full object-cover"
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
                  isCompact ? 'text-[12px]' : 'text-[13px]',
                )}
              >
                {asset.name || getAssetRoleLabel(asset)}
              </p>
            </div>

            <Button
              type="button"
              variant={undefined}
              className="h-7 w-7 shrink-0 border border-white/10 bg-transparent p-0 text-white/55 hover:bg-white/5 hover:text-white"
              icon={<HiXMark className="h-3.5 w-3.5" />}
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
            'border border-white/10 bg-transparent font-medium text-white/70 hover:bg-white/5 hover:text-white',
            isCompact ? 'h-9 px-2.5 text-[11px]' : 'h-10 px-3 text-[12px]',
          )}
          icon={<HiOutlineFolderOpen className="h-3.5 w-3.5" />}
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
