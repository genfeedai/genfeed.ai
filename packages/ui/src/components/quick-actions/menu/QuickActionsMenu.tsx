'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { IQuickAction } from '@genfeedai/contracts/interfaces/ui/quick-actions.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { QuickActionsMenuProps } from '@genfeedai/props/content/quick-actions.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import Spinner from '@ui/primitives/spinner';
import {
  QUICK_ACTION_TRIGGER_CLASS,
  QUICK_ACTION_TRIGGER_SIZE_CLASS,
} from '@ui/quick-actions/quick-actions.constants';
import { EllipsisVertical } from 'lucide-react';

const SIZE_CLASSES = {
  [ComponentSize.LG]: ButtonSize.LG,
  [ComponentSize.MD]: ButtonSize.DEFAULT,
  [ComponentSize.SM]: ButtonSize.SM,
} as const;

const NESTED_ACTION_GROUPS = [
  {
    label: 'Reframe',
    ids: [
      'portrait',
      'landscape',
      'square',
      'resize-portrait',
      'resize-landscape',
      'resize-square',
    ],
  },
  { label: 'Convert', ids: ['convert-to-video', 'gif', 'convert-to-preset'] },
  { label: 'Prompt', ids: ['copy-prompt', 'prompt', 'use-prompt'] },
];

function ActionItem({
  action,
  onActionClick,
}: {
  action: IQuickAction;
  onActionClick: QuickActionsMenuProps['onActionClick'];
}) {
  return (
    <DropdownMenuItem
      disabled={action.isDisabled || action.isLoading}
      onSelect={() => onActionClick(action)}
      className={cn(
        'text-xs font-medium',
        action.variant === 'error' &&
          'text-error focus:bg-error focus:text-destructive-foreground',
      )}
    >
      {action.isLoading ? (
        <Spinner size={ComponentSize.XS} className="shrink-0" />
      ) : (
        action.icon
      )}
      <span className="flex-1 text-left">{action.label}</span>
    </DropdownMenuItem>
  );
}

function SectionActions({
  actions,
  onActionClick,
}: {
  actions: IQuickAction[];
  onActionClick: QuickActionsMenuProps['onActionClick'];
}) {
  const renderedGroups = new Set<string>();
  return actions.map((action) => {
    const group = NESTED_ACTION_GROUPS.find((candidate) =>
      candidate.ids.includes(action.id),
    );
    if (!group)
      return (
        <ActionItem
          key={action.id}
          action={action}
          onActionClick={onActionClick}
        />
      );
    if (renderedGroups.has(group.label)) return null;
    renderedGroups.add(group.label);
    const children = actions.filter((candidate) =>
      group.ids.includes(candidate.id),
    );
    return (
      <DropdownMenuSub key={group.label}>
        <DropdownMenuSubTrigger className="text-xs font-medium">
          {group.label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent collisionPadding={8}>
          {children.map((child) => (
            <ActionItem
              key={child.id}
              action={child}
              onActionClick={onActionClick}
            />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  });
}

export default function QuickActionsMenu({
  actions,
  isMenuOpen,
  setIsMenuOpen,
  size = ComponentSize.SM,
  onActionClick,
  triggerClassName,
}: QuickActionsMenuProps): React.ReactNode {
  if (actions.length === 0) {
    return null;
  }

  const sections = new Map<string, IQuickAction[]>();
  const directActions: IQuickAction[] = [];
  for (const action of actions) {
    if (!action.sectionLabel) {
      directActions.push(action);
      continue;
    }
    const group = sections.get(action.sectionLabel) ?? [];
    group.push(action);
    sections.set(action.sectionLabel, group);
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          tooltip="More"
          tooltipPosition="top"
          size={SIZE_CLASSES[size]}
          className={cn(
            QUICK_ACTION_TRIGGER_CLASS,
            triggerClassName ?? QUICK_ACTION_TRIGGER_SIZE_CLASS,
            'text-muted-foreground hover:bg-hover hover:text-foreground',
          )}
          ariaLabel="More"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        data-testid="quick-actions-menu"
        className="min-w-40"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {directActions.map((action) => (
          <ActionItem
            key={action.id}
            action={action}
            onActionClick={onActionClick}
          />
        ))}
        {Array.from(sections, ([label, sectionActions]) => (
          <DropdownMenuSub key={label}>
            <DropdownMenuSubTrigger className="text-xs font-medium">
              {label}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent collisionPadding={8}>
              <SectionActions
                actions={sectionActions}
                onActionClick={onActionClick}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
