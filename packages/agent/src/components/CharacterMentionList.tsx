'use client';

import type {
  CharacterMentionItem,
  CharacterMentionListProps,
} from '@genfeedai/agent/types/mention.types';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import {
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';

export function CharacterMentionList({
  items,
  command,
  ref,
}: CharacterMentionListProps): ReactElement {
  const translate = useTranslations('agent.characterMentions');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

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
      <div className="border border-foreground/[0.12] bg-background px-3 py-2 text-xs text-muted-foreground shadow-lg">
        {translate('empty')}
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto border border-foreground/[0.12] bg-background shadow-lg">
      {items.map((item: CharacterMentionItem, index) => (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          key={item.id}
          onClick={() => command(item)}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-popover-foreground hover:bg-accent/50',
          )}
        >
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{item.label}</span>
            <span className="text-xs text-muted-foreground">
              @{item.handle}
            </span>
          </div>
        </Button>
      ))}
    </div>
  );
}
