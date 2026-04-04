'use client';

import {
  Boxes,
  CircleDot,
  Clapperboard,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Sparkles,
  SquarePen,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 48;

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const WORKSPACE_ITEMS: NavItem[] = [
  {
    href: '/workspace/overview',
    icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
    label: 'Dashboard',
  },
  { href: '/workspace/inbox', icon: <Inbox className="h-4 w-4 shrink-0" />, label: 'Inbox' },
  { href: '/tasks', icon: <CircleDot className="h-4 w-4 shrink-0" />, label: 'Tasks' },
];

const TOOLS_ITEMS: NavItem[] = [
  { href: '/workflows', icon: <Boxes className="h-4 w-4 shrink-0" />, label: 'Workflows' },
  { href: '/studio', icon: <Sparkles className="h-4 w-4 shrink-0" />, label: 'Studio' },
  { href: '/editor', icon: <Clapperboard className="h-4 w-4 shrink-0" />, label: 'Editor' },
  { href: '/gallery', icon: <ImageIcon className="h-4 w-4 shrink-0" />, label: 'Gallery' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/settings', icon: <Settings className="h-4 w-4 shrink-0" />, label: 'Settings' },
];

const NAV_GROUPS: NavGroup[] = [{ items: WORKSPACE_ITEMS }, { items: TOOLS_ITEMS, label: 'Tools' }];

interface CoreSidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}

export default function CoreSidebar({
  isCollapsed = false,
  onToggleCollapse,
  onClose,
}: CoreSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const handleLinkClick = () => {
    onClose?.();
  };

  return (
    <div
      data-testid="sidebar-shell"
      className={cn(
        'flex h-full min-h-0 flex-1 flex-shrink-0 bg-background',
        !isCollapsed && 'border-r border-white/[0.08]'
      )}
      style={{ minWidth: SIDEBAR_WIDTH, width: SIDEBAR_WIDTH }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header with collapse control */}
        <div
          data-testid="sidebar-header-shell"
          className="flex h-16 flex-shrink-0 items-center gap-2 px-3 border-b border-white/[0.08]"
        >
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="group w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors duration-200 flex-shrink-0 cursor-pointer"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                {isCollapsed ? (
                  <PanelLeft className="h-4 w-4 transition-opacity duration-200 group-hover:opacity-0" />
                ) : (
                  <PanelLeftClose className="h-4 w-4 transition-opacity duration-200 group-hover:opacity-0" />
                )}
                <PanelLeft className="absolute h-4 w-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              </span>
            </button>
          ) : null}
        </div>

        {/* Body — fades out when collapsed */}
        <div
          className={cn(
            'flex-1 flex flex-col min-h-0 transition-opacity duration-200',
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}
        >
          {/* New Task CTA */}
          <div className="px-3 pt-2">
            <Link
              href="/tasks?new=1"
              onClick={handleLinkClick}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors hover:bg-accent/50 no-underline text-foreground/80"
            >
              <SquarePen className="h-4 w-4 shrink-0" />
              <span>New Task</span>
            </Link>
          </div>

          {/* Navigation groups */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
            {NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.label ?? `group-${groupIndex}`}>
                {groupIndex > 0 && <div className="my-2 border-t border-white/[0.08]" />}

                {group.label ? (
                  <div className="px-2 pb-1 pt-2">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/30">
                      {group.label}
                    </span>
                  </div>
                ) : null}

                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={handleLinkClick}
                        className={cn(
                          'flex h-9 items-center gap-3 rounded-lg px-2 text-sm transition-colors duration-200',
                          'hover:bg-white/[0.06] hover:text-foreground',
                          isActive(item.href)
                            ? 'text-foreground bg-white/[0.08]'
                            : 'text-muted-foreground'
                        )}
                      >
                        {item.icon}
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom items */}
          <div className="border-t border-white/[0.08] px-3 py-2">
            <ul className="flex flex-col gap-0.5">
              {BOTTOM_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={handleLinkClick}
                    className={cn(
                      'flex h-9 items-center gap-3 rounded-lg px-2 text-sm transition-colors duration-200',
                      'hover:bg-white/[0.06] hover:text-foreground',
                      isActive(item.href)
                        ? 'text-foreground bg-white/[0.08]'
                        : 'text-muted-foreground'
                    )}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
