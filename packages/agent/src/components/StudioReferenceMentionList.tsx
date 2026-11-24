'use client';

import type { StudioReferenceMentionListProps } from '@genfeedai/props/studio/studio-reference-mention.props';
import {
  SuggestionEmpty,
  SuggestionItem,
  SuggestionList,
} from '@ui/primitives/suggestion-list';
import { AudioLines, ImageIcon, User, Video } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('agent.referenceMentions');
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
    <SuggestionList
      ariaLabel={translate('listLabel')}
      className="max-h-64 w-80 max-w-[calc(100vw-2rem)]"
      testId="studio-reference-mention-list"
    >
      {!items.length ? (
        <SuggestionEmpty>{translate('empty')}</SuggestionEmpty>
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
            <SuggestionItem
              ariaLabel={`${token}: ${name}. ${reference ? (ROLE_LABELS[reference.role] ?? reference.role) : 'Character'}`}
              isSelected={index === selectedIndex % items.length}
              key={`${item.kind}:${reference?.key ?? (item.kind === 'character' ? item.character.id : '')}`}
              onClick={() => command(item)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
            >
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
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
            </SuggestionItem>
          );
        })
      )}
    </SuggestionList>
  );
}
