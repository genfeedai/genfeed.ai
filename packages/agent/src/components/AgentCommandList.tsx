import type { AgentSlashCommand } from '@genfeedai/agent/constants/agent-slash-commands.constant';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Calendar,
  ChartColumn,
  ChartLine,
  Copy,
  FileText,
  FlaskConical,
  Hash,
  Image,
  Lightbulb,
  MessageSquareText,
  Send,
  Sparkles,
  Undo2,
  Zap,
} from 'lucide-react';
import {
  type ReactElement,
  type Ref,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';

const COMMAND_ICONS: Record<string, ReactElement> = {
  analyze: <ChartColumn className="size-4" />,
  batch: <Copy className="size-4" />,
  caption: <MessageSquareText className="size-4" />,
  'create-post': <FileText className="size-4" />,
  create: <Sparkles className="size-4" />,
  'generate-image': <Image className="size-4" />,
  hashtags: <Hash className="size-4" />,
  ideas: <Lightbulb className="size-4" />,
  remix: <Undo2 className="size-4" />,
  reply: <Send className="size-4" />,
  discover: <FlaskConical className="size-4" />,
  schedule: <Calendar className="size-4" />,
  trends: <Zap className="size-4" />,
  workflow: <ChartLine className="size-4" />,
};

interface AgentCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface AgentCommandListProps {
  items: AgentSlashCommand[];
  command: (item: AgentSlashCommand) => void;
  ref?: Ref<AgentCommandListHandle>;
}

export function AgentCommandList({
  items,
  command,
  ref,
}: AgentCommandListProps): ReactElement {
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
      <div className="border border-foreground/[0.12] bg-background px-3 py-2 text-xs text-muted-foreground shadow-lg">
        No commands found
      </div>
    );
  }

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto border border-foreground/[0.12] bg-background shadow-lg">
      {items.map((item, index) => (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          key={item.name}
          onClick={() => command(item)}
          className={cn(
            'flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-0',
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-popover-foreground hover:bg-accent/50',
          )}
        >
          <span className="flex shrink-0 text-muted-foreground">
            {COMMAND_ICONS[item.name] ?? <Zap className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              /{item.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {item.description}
            </span>
          </div>
        </Button>
      ))}
    </div>
  );
}
