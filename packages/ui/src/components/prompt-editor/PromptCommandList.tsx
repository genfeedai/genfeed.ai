'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  PromptCommand,
  PromptCommandListProps,
} from '@genfeedai/props/prompt-bars/prompt-command.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  AudioLines,
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
  Mic,
  Search,
  Send,
  Sparkles,
  Undo2,
  Video,
  Wand,
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
  analysis: <ChartColumn className="size-4" />,
  analytics: <ChartColumn className="size-4" />,
  analyze: <ChartColumn className="size-4" />,
  audio: <AudioLines className="size-4" />,
  batch: <Copy className="size-4" />,
  caption: <MessageSquareText className="size-4" />,
  create: <Sparkles className="size-4" />,
  'create-post': <FileText className="size-4" />,
  discover: <FlaskConical className="size-4" />,
  discovery: <Search className="size-4" />,
  distribution: <Send className="size-4" />,
  'generate-image': <Image className="size-4" />,
  hashtags: <Hash className="size-4" />,
  ideas: <Lightbulb className="size-4" />,
  image: <Image className="size-4" />,
  interview: <Mic className="size-4" />,
  optimization: <Wand className="size-4" />,
  remix: <Undo2 className="size-4" />,
  reply: <Send className="size-4" />,
  schedule: <Calendar className="size-4" />,
  trends: <Zap className="size-4" />,
  video: <Video className="size-4" />,
  workflow: <ChartLine className="size-4" />,
  writing: <FileText className="size-4" />,
};

export interface PromptCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface Props extends PromptCommandListProps {
  ref?: Ref<PromptCommandListHandle>;
}

function commandIcon(item: PromptCommand): ReactElement {
  return (
    COMMAND_ICONS[item.name] ??
    COMMAND_ICONS[item.iconKey ?? ''] ?? <Zap className="size-4" />
  );
}

/**
 * Keyboard-driven `/` palette body. Rendered inside the TipTap suggestion
 * popup, so it owns selection state but not placement or mounting.
 */
export function PromptCommandList({
  command,
  emptyLabel = 'No commands found',
  items,
  ref,
}: Props): ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // The popup is reused across queries; keep the highlight on a real row
  // rather than a stale index past the end of a narrower result set.
  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (items.length === 0) {
        return false;
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex % items.length];
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
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className="w-80 max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto border border-foreground/[0.12] bg-background shadow-lg"
      data-testid="prompt-command-list"
    >
      {items.map((item, index) => (
        <Button
          className={cn(
            'flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-0',
            index === selectedIndex % items.length
              ? 'bg-accent text-accent-foreground'
              : 'text-popover-foreground hover:bg-accent/50',
          )}
          key={item.name}
          onClick={() => command(item)}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <span className="flex shrink-0 text-muted-foreground">
            {commandIcon(item)}
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
