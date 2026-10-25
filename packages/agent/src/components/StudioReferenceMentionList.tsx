'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioReferenceMentionListProps } from '@genfeedai/props/studio/studio-reference-mention.props';
import { Button } from '@ui/primitives/button';
import { AudioLines, ImageIcon, User, Video } from 'lucide-react';
import Image from 'next/image';
import { useImperativeHandle, useState } from 'react';

const ROLE_LABELS: Record<string, string> = {
  audioReference: 'Audio reference',
  editMask: 'Mask',
  editSource: 'Editing source',
  endFrame: 'End frame',
  reference: 'Reference',
  startFrame: 'Start frame',
  videoReference: 'Video reference',
};

export default function StudioReferenceMentionList({
  items,
  command,
  ref,
}: StudioReferenceMentionListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const delta = event.key === 'ArrowUp' ? -1 : 1;
        setSelectedIndex(
          (index) => (index + delta + items.length) % items.length,
        );
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex % items.length];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  return (
    <div
      aria-label="References and characters"
      className="max-h-64 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
      data-testid="studio-reference-mention-list"
      role="listbox"
    >
      {!items.length ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          No matching references or characters
        </p>
      ) : (
        items.map((item, index) => {
          const reference = item.kind === 'reference' ? item.reference : null;
          const token =
            reference?.token ??
            (item.kind === 'character' ? `@${item.character.handle}` : '');
          const name =
            reference?.name ??
            (item.kind === 'character' ? item.character.label : '');
          const Icon =
            reference?.kind === 'video'
              ? Video
              : reference?.kind === 'audio'
                ? AudioLines
                : reference
                  ? ImageIcon
                  : User;
          return (
            <Button
              ariaLabel={`${token}: ${name}. ${reference ? (ROLE_LABELS[reference.role] ?? reference.role) : 'Character'}`}
              aria-selected={index === selectedIndex % items.length}
              className={cn(
                'flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                index === selectedIndex % items.length
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-hover',
              )}
              key={`${item.kind}:${reference?.key ?? (item.kind === 'character' ? item.character.id : '')}`}
              onClick={() => command(item)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-muted-foreground">
                {reference?.previewUrl ? (
                  <Image
                    alt=""
                    className="size-full object-cover"
                    height={32}
                    src={reference.previewUrl}
                    unoptimized
                    width={32}
                  />
                ) : (
                  <Icon aria-hidden className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {token}{' '}
                  <span className="font-normal text-muted-foreground">
                    {name}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {reference
                    ? (ROLE_LABELS[reference.role] ?? reference.role)
                    : 'Character'}
                </span>
              </span>
            </Button>
          );
        })
      )}
    </div>
  );
}
