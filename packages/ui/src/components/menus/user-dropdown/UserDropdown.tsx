'use client';

import { ButtonVariant } from '@genfeedai/enums';
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
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  HiOutlineBuildingOffice2,
  HiOutlineCog6Tooth,
  HiOutlineQuestionMarkCircle,
  HiOutlineTag,
  HiOutlineUser,
} from 'react-icons/hi2';

interface DropdownItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

interface UserDropdownProps {
  userName: string;
  userEmail: string;
  settingsScope?: 'all' | 'user';
  side?: 'top' | 'bottom';
}

export default function UserDropdown({
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
    { href: '/settings', icon: HiOutlineUser, label: 'Personal' },
    {
      href: orgHref('/settings'),
      icon: HiOutlineBuildingOffice2,
      label: 'Organization',
    },
    { href: orgHref('/settings/brands'), icon: HiOutlineTag, label: 'Brands' },
    {
      href: '/settings/help',
      icon: HiOutlineQuestionMarkCircle,
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="size-8 rounded-lg flex items-center justify-center text-foreground/30 hover:text-foreground/60 hover:bg-foreground/[0.06] transition-colors flex-shrink-0 cursor-pointer"
          ariaLabel="Settings"
        >
          <HiOutlineCog6Tooth className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {dropdownItems.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} className="cursor-pointer">
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
