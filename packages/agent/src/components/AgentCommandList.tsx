import type { AgentSlashCommand } from '@genfeedai/agent/constants/agent-slash-commands.constant';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import {
  HiOutlineBolt,
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineDocumentText,
  HiOutlineHashtag,
  HiOutlineLightBulb,
  HiOutlinePhoto,
  HiOutlineRocketLaunch,
  HiOutlineSquare2Stack,
} from 'react-icons/hi2';

const COMMAND_ICONS: Record<string, ReactElement> = {
  analyze: <HiOutlineChartBar className="h-4 w-4" />,
  batch: <HiOutlineSquare2Stack className="h-4 w-4" />,
  caption: <HiOutlineChatBubbleBottomCenterText className="h-4 w-4" />,
  'create-post': <HiOutlineDocumentText className="h-4 w-4" />,
  'generate-image': <HiOutlinePhoto className="h-4 w-4" />,
  hashtags: <HiOutlineHashtag className="h-4 w-4" />,
  ideas: <HiOutlineLightBulb className="h-4 w-4" />,
  repurpose: <HiOutlineRocketLaunch className="h-4 w-4" />,
  schedule: <HiOutlineCalendarDays className="h-4 w-4" />,
  trends: <HiOutlineBolt className="h-4 w-4" />,
};

interface AgentCommandListProps {
  items: AgentSlashCommand[];
  command: (item: AgentSlashCommand) => void;
}

export const AgentCommandList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  AgentCommandListProps
>(function AgentCommandList({ items, command }, ref): ReactElement {
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
        No commands found
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-white/[0.12] bg-popover shadow-lg">
      {items.map((item, index) => (
        <button
          type="button"
          key={item.name}
          onClick={() => command(item)}
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-popover-foreground hover:bg-accent/50',
          )}
        >
          <span className="flex shrink-0 text-muted-foreground">
            {COMMAND_ICONS[item.name] ?? <HiOutlineBolt className="h-4 w-4" />}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">/{item.name}</span>
            <span className="text-xs text-muted-foreground">
              {item.description}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
});
