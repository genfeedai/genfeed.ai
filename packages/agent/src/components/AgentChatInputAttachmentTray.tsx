import { ButtonVariant } from '@genfeedai/enums';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import type { ReactElement } from 'react';
import { HiPhoto, HiXMark } from 'react-icons/hi2';

type AgentChatInputAttachmentTrayProps = {
  assets: PromptBarAttachedAsset[];
  isDisabled: boolean | undefined;
  onRemoveAttachedAsset: (assetId: string) => void;
};

export function AgentChatInputAttachmentTray({
  assets,
  isDisabled,
  onRemoveAttachedAsset,
}: AgentChatInputAttachmentTrayProps): ReactElement {
  return (
    <div className="px-2 pb-2 pt-1">
      <div className="flex flex-wrap gap-2">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className={cn(
              'group relative size-16 overflow-hidden rounded-md border border-border bg-background-secondary',
              isDisabled && 'opacity-60',
            )}
            title={asset.name}
          >
            {asset.previewUrl ? (
              <Image
                src={asset.previewUrl}
                alt={asset.name}
                fill
                sizes="64px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <HiPhoto className="size-5" />
              </div>
            )}
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => onRemoveAttachedAsset(asset.id)}
              isDisabled={isDisabled}
              ariaLabel={`Remove ${asset.name}`}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background/88 text-foreground/70 opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
            >
              <HiXMark className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
