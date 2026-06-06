'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { type Ref, useEffect, useImperativeHandle, useState } from 'react';

export interface WorkspaceBrandMentionItem {
  id: string;
  label: string;
}

interface WorkspaceBrandMentionListProps {
  command: (item: WorkspaceBrandMentionItem) => void;
  items: WorkspaceBrandMentionItem[];
  ref?: Ref<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }>;
}

export function WorkspaceBrandMentionList({
  command,
  items,
  ref,
}: WorkspaceBrandMentionListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
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
      <div className="rounded-lg border border-white/[0.12] bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
        No brands found
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.12] bg-popover shadow-lg">
      {items.map((item, index) => (
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
          <span className="font-medium">@{item.label}</span>
        </Button>
      ))}
    </div>
  );
}
