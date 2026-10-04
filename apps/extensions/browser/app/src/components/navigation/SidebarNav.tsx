import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
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
  | 'idea'
  | 'knowledge'
  | 'settings';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const NAV_ITEMS = [
  { id: 'chat', label: 'Create', icon: MessageSquare },
  { id: 'reply', label: 'Reply', icon: Reply },
  { id: 'remix', label: 'Remix', icon: Shuffle },
  { id: 'idea', label: 'Imported', icon: Import },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'history', label: 'History', icon: History },
  { id: 'create', label: 'Tools', icon: Plus },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export function SidebarNav({
  activeTab,
  onTabChange,
}: SidebarNavProps): ReactElement {
  const secondary = NAV_ITEMS.slice(3);
  const secondaryActive = secondary.find((item) => item.id === activeTab);
  return (
    <nav
      aria-label="Genfeed tools"
      className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2"
    >
      {NAV_ITEMS.slice(0, 3).map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={
            activeTab === id ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
          }
          size={ButtonSize.SM}
          withWrapper={false}
          icon={<Icon className="size-3.5" />}
          ariaLabel={label}
          aria-current={activeTab === id ? 'page' : undefined}
          onClick={() => onTabChange(id)}
          className="shrink-0"
        >
          {label}
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
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
