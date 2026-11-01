'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Building2, CircleQuestionMark, LogOut, Tag, User } from 'lucide-react';
import Link from 'next/link';
import AccountCredits from '@/components/topbars/credits-bar/AccountCredits';

interface DropdownItem {
  label: string;
  href: string;
  icon: IconComponent;
}

interface UserDropdownProps {
  userName: string;
  userEmail: string;
  imageUrl?: string | null;
  settingsScope?: 'all' | 'user';
  side?: 'top' | 'bottom' | 'right';
}

export default function UserDropdown({
  imageUrl,
  settingsScope = 'all',
  side = 'top',
  userName,
  userEmail,
}: UserDropdownProps) {
  const { orgHref } = useOrgUrl();
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
          className="shrink-0 cursor-pointer rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ariaLabel="Open account menu"
        >
          <Avatar alt={userName} name={userName} size="md" src={imageUrl} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        side={side}
        sideOffset={side === 'right' ? 12 : 4}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AccountCredits />
        {dropdownItems.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} className="cursor-pointer">
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={APP_ROUTES.LOGOUT} className="cursor-pointer">
            <LogOut className="size-4" />
            Sign out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
