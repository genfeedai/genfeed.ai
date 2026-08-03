'use client';

import {
  COMPOSER_MODES,
  type ComposerMode,
  getComposerModeDefinition,
} from '@genfeedai/agent/constants/composer-mode.constant';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  ChevronUp,
  ImageIcon,
  type LucideIcon,
  MessageSquare,
  Mic,
  Video,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';

type AgentComposerModeControlProps = {
  density?: 'compact' | 'default';
  isDisabled?: boolean;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
};

const MODE_ICONS: Record<ComposerMode, LucideIcon> = {
  chat: MessageSquare,
  image: ImageIcon,
  video: Video,
  voice: Mic,
};

export function AgentComposerModeControl({
  density = 'default',
  isDisabled = false,
  mode,
  onModeChange,
}: AgentComposerModeControlProps): ReactElement {
  const [open, setOpen] = useState(false);
  const isCompact = density === 'compact';
  const current = getComposerModeDefinition(mode);
  const CurrentIcon = MODE_ICONS[mode];

  return (
    <Popover
      open={isDisabled ? false : open}
      onOpenChange={(nextOpen) => {
        if (isDisabled) {
          return;
        }
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ariaLabel={`Composer mode: ${current.label}`}
          className={cn(
            'shrink-0',
            // Same ghost chip as Actions in this toolbar.
            isCompact ? 'h-8 gap-1 px-1.5' : 'h-9 gap-1.5 px-2.5',
          )}
          data-testid="composer-mode-control"
          icon={<CurrentIcon className="size-4" />}
          isDisabled={isDisabled}
          textTransform="none"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span className="text-xs">{current.label}</span>
          <ChevronUp
            className={cn(
              'size-3.5 shrink-0 opacity-70 transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 rounded-xl border-border bg-background p-1.5 text-foreground"
        collisionPadding={12}
        side="top"
        sideOffset={8}
      >
        <div
          aria-label="Composer modes"
          className="flex flex-col gap-0.5"
          role="group"
        >
          {COMPOSER_MODES.map((item) => {
            const isActive = item.mode === mode;
            const Icon = MODE_ICONS[item.mode];
            return (
              <Button
                key={item.mode}
                aria-current={isActive ? 'true' : undefined}
                ariaLabel={item.label}
                // Exact ModelRow recipe — full-height selected row, multi-line OK.
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                  isActive
                    ? 'bg-foreground/12 text-foreground ring-1 ring-inset ring-border'
                    : 'text-foreground hover:bg-foreground/[0.06]',
                )}
                data-active={isActive ? 'true' : 'false'}
                data-testid={`composer-mode-${item.mode}`}
                onClick={() => {
                  onModeChange(item.mode);
                  setOpen(false);
                }}
                textTransform="none"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="text-[10px] leading-snug text-muted-foreground">
                    {item.description}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
