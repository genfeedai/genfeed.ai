import type { CredentialMentionItem } from '@genfeedai/agent/services/agent-api.service';
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

interface CredentialMentionListProps {
  items: CredentialMentionItem[];
  command: (item: CredentialMentionItem) => void;
}

export const CredentialMentionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  CredentialMentionListProps
>(function CredentialMentionList({ items, command }, ref): ReactElement {
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
        No connected accounts found
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
          {item.avatar && (
            <img
              src={item.avatar}
              alt={item.handle}
              className="h-6 w-6 rounded-full object-cover"
            />
          )}
          <div className="flex flex-col">
            <span className="font-medium">!{item.handle}</span>
            {item.name !== item.handle && (
              <span className="text-xs text-muted-foreground">{item.name}</span>
            )}
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground capitalize">
            {item.platform}
          </span>
        </Button>
      ))}
    </div>
  );
});
