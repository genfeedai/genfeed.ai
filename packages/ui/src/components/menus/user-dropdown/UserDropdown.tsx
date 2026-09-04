'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  Building2,
  CircleQuestionMark,
  Ellipsis,
  LogOut,
  Tag,
  User,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';

interface DropdownItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface UserDropdownProps {
  userName: string;
  userEmail: string;
  imageUrl?: string | null;
  settingsScope?: 'all' | 'user';
  showIdentity?: boolean;
  side?: 'top' | 'bottom';
}

export default function UserDropdown({
  imageUrl,
  settingsScope = 'all',
  showIdentity = false,
  side = 'top',
  userName,
  userEmail,
}: UserDropdownProps) {
  const { orgHref } = useOrgUrl();
  const initial = userName.trim().charAt(0).toUpperCase() || 'U';
  // Cross-scope switcher for the scope-specific Settings sidebar: each entry
  // enters a settings scope, whose sidebar then shows only that scope's pages
  // (see buildSettingsMenuItems). Help is part of the personal scope. See #1231.
  const allDropdownItems: DropdownItem[] = [
    { href: APP_ROUTES.SETTINGS.PERSONAL, icon: User, label: 'Personal' },
    {
      href: orgHref(APP_ROUTES.SETTINGS.GENERAL),
      icon: Building2,
      label: 'Organization',
    },
    {
      href: orgHref(APP_ROUTES.SETTINGS.BRANDS),
      icon: Tag,
      label: 'Brands',
    },
    {
      href: APP_ROUTES.SETTINGS.HELP,
      icon: CircleQuestionMark,
      label: 'Help',
    },
  ];
  const dropdownItems =
    settingsScope === 'user'
      ? allDropdownItems.filter((item) =>
          ['Personal', 'Help'].includes(item.label),
        )
      : allDropdownItems;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          textTransform="none"
          className={cn(
            'flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            showIdentity
              ? 'group flex h-16 w-full min-w-0 items-center justify-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-hover'
              : 'size-8 overflow-hidden rounded-full transition-opacity hover:opacity-90',
          )}
          ariaLabel="Open account menu"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={userName}
              width={32}
              height={32}
              className="size-8 rounded-full object-cover object-center outline-media"
              sizes="32px"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-foreground/15 text-sm font-semibold text-foreground/85">
              {initial}
            </span>
          )}
          {showIdentity ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {userName}
                </span>
                {userEmail ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {userEmail}
                  </span>
                ) : null}
              </span>
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground"
                data-account-menu-affordance
              >
                <Ellipsis className="size-4" />
              </span>
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={showIdentity ? 'start' : 'end'}
        className={cn(
          showIdentity
            ? 'w-[var(--radix-dropdown-menu-trigger-width)]'
            : 'w-56',
        )}
        side={side}
        sideOffset={showIdentity ? 8 : 4}
      >
        {showIdentity ? null : (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {userEmail}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {dropdownItems.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              className={cn('cursor-pointer', showIdentity && 'h-9')}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={APP_ROUTES.LOGOUT}
            className={cn('cursor-pointer', showIdentity && 'h-9')}
          >
            <LogOut className="size-4" />
            Sign out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
