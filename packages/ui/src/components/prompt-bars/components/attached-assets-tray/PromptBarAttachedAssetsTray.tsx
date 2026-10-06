'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { Button } from '@ui/primitives/button';
import { FolderOpen, ImageIcon, Music, Tv, X } from 'lucide-react';
import Image from 'next/image';
import { memo } from 'react';

const DEFAULT_ASSET_MESSAGES = {
  editingTarget: 'Editing target',
  editingSource: 'Editing source',
  mask: 'Mask',
  videoReference: 'Video reference',
  startFrame: 'Start frame',
  endFrame: 'End frame',
  input: 'Input',
  reference: 'Reference',
  assetGroup: '{role}: {name}',
  removeAsset: 'Remove {name}',
  library: 'Library',
  browseLibrary: 'Browse library',
} as const;

type AssetMessageKey = keyof typeof DEFAULT_ASSET_MESSAGES;
type AssetTranslator = (
  key: AssetMessageKey,
  values?: Record<string, string>,
) => string;

const translateDefault: AssetTranslator = (key, values) =>
  DEFAULT_ASSET_MESSAGES[key].replace(
    /\{(\w+)\}/g,
    (token, name: string) => values?.[name] ?? token,
  );

interface PromptBarAttachedAssetsTrayProps {
  assets: PromptBarAttachedAsset[];
  unoptimizedImages?: boolean;
  density?: 'compact' | 'default';
  translate?: AssetTranslator;
  dragError?: string | null;
  isDisabled?: boolean;
  onBrowseAssets?: () => void;
  onRemoveAttachedAsset: (assetId: string) => void;
}

function getAssetRoleKey(asset: PromptBarAttachedAsset): AssetMessageKey {
  switch (asset.role) {
    case 'editSource':
      return asset.isPrimary ? 'editingTarget' : 'editingSource';
    case 'editMask':
      return 'mask';
    case 'videoReference':
      return 'videoReference';
    case 'startFrame':
      return 'startFrame';
    case 'endFrame':
      return 'endFrame';
    case 'input':
      return 'input';
    default:
      return 'reference';
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
  translate = translateDefault,
  dragError,
  isDisabled = false,
  onBrowseAssets,
  onRemoveAttachedAsset,
}: PromptBarAttachedAssetsTrayProps) {
  function getAssetRoleLabel(asset: PromptBarAttachedAsset): string {
    return translate(getAssetRoleKey(asset));
  }

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
            role="group"
            aria-label={translate('assetGroup', {
              role: getAssetRoleLabel(asset),
              name: asset.name || getAssetRoleLabel(asset),
            })}
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
                {asset.name && asset.role !== 'reference' ? (
                  <span className="text-muted-foreground">
                    {getAssetRoleLabel(asset)} ·{' '}
                  </span>
                ) : null}
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
              ariaLabel={translate('removeAsset', {
                name: asset.name || getAssetRoleLabel(asset),
              })}
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
            {translate(isCompact ? 'library' : 'browseLibrary')}
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
