import type { ConversationComposerContextReferenceKind } from '@genfeedai/agent/models/conversation-composer.model';
import { ButtonVariant } from '@genfeedai/contracts';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Film, ImageIcon, Link, Volume2, X } from 'lucide-react';
import Image from 'next/image';
import type { ReactElement } from 'react';

export interface AgentChatReferenceItem {
  id: string;
  label: string;
  type:
    | 'asset'
    | 'brand'
    | 'content'
    | 'character'
    | 'credential'
    | 'team'
    | ConversationComposerContextReferenceKind;
  /** Library content only — used for visual reference tiles. */
  contentType?: string;
  thumbnailUrl?: string;
}

type AgentChatInputAttachmentTrayProps = {
  assets: PromptBarAttachedAsset[];
  attachmentStatusById?: Record<
    string,
    'completed' | 'failed' | 'pending' | 'uploading'
  >;
  isDisabled: boolean | undefined;
  onRemoveAttachedAsset: (assetId: string) => void;
  onRemoveReference?: (reference: AgentChatReferenceItem) => void;
  references?: AgentChatReferenceItem[];
};

function isVisualContentReference(reference: AgentChatReferenceItem): boolean {
  return reference.type === 'content';
}

export function AgentChatInputAttachmentTray({
  assets,
  attachmentStatusById = {},
  isDisabled,
  onRemoveAttachedAsset,
  onRemoveReference,
  references = [],
}: AgentChatInputAttachmentTrayProps): ReactElement {
  const contentReferences = references.filter(isVisualContentReference);
  const chipReferences = references.filter(
    (reference) => !isVisualContentReference(reference),
  );

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
                    <Film aria-hidden="true" className="size-5" />
                  ) : asset.kind === 'audio' ? (
                    <Volume2 aria-hidden="true" className="size-5" />
                  ) : (
                    <ImageIcon aria-hidden="true" className="size-5" />
                  )}
                </div>
              )}
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => onRemoveAttachedAsset(asset.id)}
                isDisabled={isDisabled}
                ariaLabel={`Remove ${assetName}`}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-md border border-border bg-background/88 text-foreground/70 opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </Button>
              {status !== 'completed' ? (
                <span
                  className={cn(
                    'absolute inset-x-1 bottom-1 truncate rounded bg-background/90 px-1 py-0.5 text-center text-2xs font-medium',
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

        {contentReferences.map((reference) => (
          <div
            aria-label={`Referenced content: ${reference.label}`}
            key={`content:${reference.id}`}
            className={cn(
              'group relative size-16 overflow-hidden rounded-md border border-border bg-background-secondary',
              isDisabled && 'opacity-60',
            )}
            title={reference.label}
            role="group"
          >
            {reference.thumbnailUrl ? (
              <Image
                src={reference.thumbnailUrl}
                alt={reference.label}
                fill
                sizes="64px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-0.5 px-1 text-muted-foreground">
                <ImageIcon aria-hidden="true" className="size-5" />
                <span className="max-w-full truncate text-2xs font-medium text-foreground/55">
                  {reference.contentType ?? 'content'}
                </span>
              </div>
            )}
            {onRemoveReference ? (
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => onRemoveReference(reference)}
                isDisabled={isDisabled}
                ariaLabel={`Remove reference ${reference.label}`}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-md border border-border bg-background/88 text-foreground/70 opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-center text-2xs font-medium text-foreground/70">
              {reference.label}
            </span>
          </div>
        ))}

        {chipReferences.map((reference) => (
          <span
            className="inline-flex max-w-48 items-center gap-1.5 rounded-lg border border-border bg-background-secondary px-2.5 py-1.5 text-xs text-foreground/78"
            key={`${reference.type}:${reference.id}`}
            title={reference.label}
          >
            <Link className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{reference.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
