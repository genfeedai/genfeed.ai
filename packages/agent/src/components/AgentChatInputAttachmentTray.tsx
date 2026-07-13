import { ButtonVariant } from '@genfeedai/enums';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import type { ReactElement } from 'react';
import {
  HiFilm,
  HiLink,
  HiPhoto,
  HiSpeakerWave,
  HiXMark,
} from 'react-icons/hi2';

export interface AgentChatReferenceItem {
  id: string;
  label: string;
  type: 'brand' | 'content' | 'credential' | 'team';
}

type AgentChatInputAttachmentTrayProps = {
  assets: PromptBarAttachedAsset[];
  attachmentStatusById?: Record<
    string,
    'completed' | 'failed' | 'pending' | 'uploading'
  >;
  isDisabled: boolean | undefined;
  onRemoveAttachedAsset: (assetId: string) => void;
  references?: AgentChatReferenceItem[];
};

export function AgentChatInputAttachmentTray({
  assets,
  attachmentStatusById = {},
  isDisabled,
  onRemoveAttachedAsset,
  references = [],
}: AgentChatInputAttachmentTrayProps): ReactElement {
  return (
    <div
      aria-label="Composer attachments and references"
      aria-live="polite"
      className="px-2 pb-2 pt-1"
      role="group"
    >
      <div className="flex flex-wrap items-center gap-2">
        {assets.map((asset) => {
          const assetName = asset.name ?? 'Attached asset';
          const status = attachmentStatusById[asset.id] ?? 'completed';

          return (
            <div
              aria-label={`${assetName}: ${status}`}
              key={asset.id}
              className={cn(
                'group relative size-16 overflow-hidden rounded-md border border-border bg-background-secondary',
                isDisabled && 'opacity-60',
                status === 'failed' && 'border-destructive/50',
              )}
              title={assetName}
              role="group"
            >
              {asset.previewUrl && asset.kind === 'image' ? (
                <Image
                  src={asset.previewUrl}
                  alt={assetName}
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  {asset.kind === 'video' ? (
                    <HiFilm aria-hidden="true" className="size-5" />
                  ) : asset.kind === 'audio' ? (
                    <HiSpeakerWave aria-hidden="true" className="size-5" />
                  ) : (
                    <HiPhoto aria-hidden="true" className="size-5" />
                  )}
                </div>
              )}
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => onRemoveAttachedAsset(asset.id)}
                isDisabled={isDisabled}
                ariaLabel={`Remove ${assetName}`}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background/88 text-foreground/70 opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
              >
                <HiXMark className="size-3.5" />
              </Button>
              {status !== 'completed' ? (
                <span
                  className={cn(
                    'absolute inset-x-1 bottom-1 truncate rounded bg-background/90 px-1 py-0.5 text-center text-[9px] font-medium',
                    status === 'failed'
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {status === 'failed' ? 'Reattach' : 'Uploading'}
                </span>
              ) : null}
            </div>
          );
        })}

        {references.map((reference) => (
          <span
            className="inline-flex max-w-48 items-center gap-1.5 rounded-lg border border-border bg-background-secondary px-2.5 py-1.5 text-xs text-foreground/78"
            key={`${reference.type}:${reference.id}`}
            title={reference.label}
          >
            <HiLink className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{reference.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
