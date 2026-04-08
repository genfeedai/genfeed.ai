import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';

interface ContentMentionListProps {
  items: ContentMentionItem[];
  command: (item: ContentMentionItem) => void;
}

export const ContentMentionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  ContentMentionListProps
>(function ContentMentionList({ items, command }, ref): ReactElement {
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
      <div className="border border-white/[0.12] bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
        No content found
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto border border-white/[0.12] bg-popover shadow-lg">
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
          {item.thumbnailUrl && (
            <img
              src={item.thumbnailUrl}
              alt={item.contentTitle}
              className="h-8 w-8 rounded object-cover"
            />
          )}
          <div className="flex flex-col">
            <span className="font-medium">{item.contentTitle}</span>
          </div>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {item.contentType}
          </span>
        </Button>
      ))}
    </div>
  );
});
