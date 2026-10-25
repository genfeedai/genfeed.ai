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
  DropdownMenuSeparator,
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
import {
  ArrowRightLeft,
  ClipboardCheck,
  Crop,
  EllipsisVertical,
  Library,
  type LucideIcon,
  MessageSquareText,
  Sparkles,
  Stamp,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

const SIZE_CLASSES = {
  [ComponentSize.LG]: ButtonSize.LG,
  [ComponentSize.MD]: ButtonSize.DEFAULT,
  [ComponentSize.SM]: ButtonSize.SM,
} as const;

const NESTED_ACTION_GROUPS = [
  {
    key: 'reframe',
    ids: [
      'portrait',
      'landscape',
      'square',
      'resize-portrait',
      'resize-landscape',
      'resize-square',
    ],
  },
  { key: 'convert', ids: ['convert-to-video', 'gif', 'convert-to-preset'] },
  { key: 'prompt', ids: ['copy-prompt', 'prompt', 'use-prompt'] },
];

/** Every submenu trigger carries an icon, like the actions beside it. */
const SUBMENU_ICONS: Record<string, LucideIcon> = {
  Branding: Stamp,
  Danger: TriangleAlert,
  Library,
  Review: ClipboardCheck,
  Transform: Sparkles,
  convert: ArrowRightLeft,
  prompt: MessageSquareText,
  reframe: Crop,
};

function SubmenuTrigger({
  iconKey,
  label,
}: {
  iconKey: string;
  label: string;
}) {
  const Icon = SUBMENU_ICONS[iconKey];
  return (
    <DropdownMenuSubTrigger className="text-xs font-medium">
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      <span className="flex-1 text-left">{label}</span>
    </DropdownMenuSubTrigger>
  );
}

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
          'text-destructive focus:bg-destructive focus:text-destructive-foreground',
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

/**
 * One level of the menu: submenus first, a divider, then the plain actions.
 * Every level follows the same order so folders and actions never interleave.
 */
function SectionActions({
  actions,
  onActionClick,
}: {
  actions: IQuickAction[];
  onActionClick: QuickActionsMenuProps['onActionClick'];
}) {
  const translate = useTranslations('ui.quickActions.groups');
  const groups = NESTED_ACTION_GROUPS.map((group) => ({
    ...group,
    children: actions.filter((action) => group.ids.includes(action.id)),
  })).filter((group) => group.children.length > 0);
  const nestedIds = new Set(groups.flatMap((group) => group.ids));
  const leaves = actions.filter((action) => !nestedIds.has(action.id));

  return (
    <>
      {groups.map((group) => (
        <DropdownMenuSub key={group.key}>
          <SubmenuTrigger iconKey={group.key} label={translate(group.key)} />
          <DropdownMenuSubContent collisionPadding={8}>
            {group.children.map((child) => (
              <ActionItem
                key={child.id}
                action={child}
                onActionClick={onActionClick}
              />
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
      {groups.length > 0 && leaves.length > 0 ? (
        <DropdownMenuSeparator />
      ) : null}
      {leaves.map((action) => (
        <ActionItem
          key={action.id}
          action={action}
          onActionClick={onActionClick}
        />
      ))}
    </>
  );
}

export default function QuickActionsMenu({
  actions,
  isMenuOpen,
  setIsMenuOpen,
  size = ComponentSize.SM,
  onActionClick,
  triggerClassName,
}: QuickActionsMenuProps): React.ReactNode {
  const translate = useTranslations('ui.quickActions');
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
          tooltip={translate('more')}
          tooltipPosition="top"
          size={SIZE_CLASSES[size]}
          className={cn(
            QUICK_ACTION_TRIGGER_CLASS,
            triggerClassName ?? QUICK_ACTION_TRIGGER_SIZE_CLASS,
            'text-muted-foreground hover:bg-hover hover:text-foreground',
          )}
          ariaLabel={translate('more')}
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
        {Array.from(sections, ([label, sectionActions]) => (
          <DropdownMenuSub key={label}>
            <SubmenuTrigger iconKey={label} label={label} />
            <DropdownMenuSubContent collisionPadding={8}>
              <SectionActions
                actions={sectionActions}
                onActionClick={onActionClick}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
        {sections.size > 0 && directActions.length > 0 ? (
          <DropdownMenuSeparator />
        ) : null}
        {directActions.map((action) => (
          <ActionItem
            key={action.id}
            action={action}
            onActionClick={onActionClick}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
