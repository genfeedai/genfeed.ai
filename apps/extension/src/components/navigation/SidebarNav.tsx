import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import {
  BookOpen,
  History,
  Import,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Reply,
  Settings,
  Shuffle,
} from 'lucide-react';
import type { ReactElement } from 'react';

export type ActiveTab =
  | 'chat'
  | 'history'
  | 'create'
  | 'remix'
  | 'reply'
  | 'imported'
  | 'knowledge'
  | 'settings';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const NAV_ITEMS = [
  { id: 'reply', label: 'Reply', icon: Reply },
  { id: 'chat', label: 'Create', icon: MessageSquare },
  { id: 'remix', label: 'Remix', icon: Shuffle },
  { id: 'imported', label: 'Imported', icon: Import },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'history', label: 'History', icon: History },
  { id: 'create', label: 'Tools', icon: Plus },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export function SidebarNav({
  activeTab,
  onTabChange,
}: SidebarNavProps): ReactElement {
  const primary = NAV_ITEMS.slice(0, 3);
  const secondary = NAV_ITEMS.slice(3);
  const secondaryActive = secondary.find((item) => item.id === activeTab);
  return (
    <nav
      aria-label="Genfeed tools"
      className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2"
    >
      <SegmentedControl
        ariaLabel="Primary tools"
        onValueChange={onTabChange}
        options={NAV_ITEMS.slice(0, 3).map(({ id, label, icon: Icon }) => ({
          icon: <Icon />,
          label,
          value: id,
        }))}
        size="sm"
        value={
          primary.some((item) => item.id === activeTab) ? activeTab : undefined
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* ui-guard-allow:selection-button -- overflow menu trigger, not a choice group */}
          <Button
            withWrapper={false}
            variant={
              secondaryActive ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
            }
            size={ButtonSize.ICON}
            ariaLabel={secondaryActive?.label ?? 'More tools'}
            icon={<MoreHorizontal className="size-4" />}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {secondary.map(({ id, label, icon: Icon }) => (
            <DropdownMenuItem key={id} onSelect={() => onTabChange(id)}>
              <Icon className="mr-2 size-4" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
