'use client';

import type {
  CharacterMentionItem,
  CharacterMentionListProps,
} from '@genfeedai/agent/types/mention.types';
import { useResetOnChange } from '@hooks/utils/use-reset-on-change/use-reset-on-change';
import { Badge } from '@ui/primitives/badge';
import {
  SuggestionEmpty,
  SuggestionItem,
  SuggestionList,
} from '@ui/primitives/suggestion-list';
import { useTranslations } from 'next-intl';
import { type ReactElement, useImperativeHandle, useState } from 'react';

export function CharacterMentionList({
  items,
  command,
  ref,
}: CharacterMentionListProps): ReactElement {
  const translate = useTranslations('agent.characterMentions');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useResetOnChange([items], () => {
    setSelectedIndex(0);
  });

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex(
          (previous) => (previous + items.length - 1) % items.length,
        );
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((previous) => (previous + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <SuggestionList>
        <SuggestionEmpty>{translate('empty')}</SuggestionEmpty>
      </SuggestionList>
    );
  }

  return (
    <SuggestionList>
      {items.map((item: CharacterMentionItem, index) => (
        <SuggestionItem
          isSelected={index === selectedIndex}
          key={item.id}
          onClick={() => command(item)}
        >
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{item.label}</span>
            <span className="text-xs text-muted-foreground">
              @{item.handle}
            </span>
          </div>
          {item.isShared ? (
            <Badge className="ml-auto shrink-0">
              {translate('sharedBadge', {
                brand: item.owningBrandName ?? '',
                count: item.availableBrandCount ?? 0,
              })}
            </Badge>
          ) : null}
        </SuggestionItem>
      ))}
    </SuggestionList>
  );
}
