'use client';

import { APP_ROUTES } from '@genfeedai/constants';
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
import Image from 'next/image';
import Link from 'next/link';
import { type ComponentType, useCallback, useState } from 'react';
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineBuildingOffice2,
  HiOutlineQuestionMarkCircle,
  HiOutlineTag,
  HiOutlineUser,
} from 'react-icons/hi2';
import { scheduleModalGlobalSideEffectCleanup } from '../../../utils/modal-global-side-effects';

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
  side?: 'top' | 'bottom';
}

export default function UserDropdown({
  imageUrl,
  settingsScope = 'all',
  side = 'top',
  userName,
  userEmail,
}: UserDropdownProps) {
  const { orgHref } = useOrgUrl();
  const [isOpen, setIsOpen] = useState(false);
  const initial = userName.trim().charAt(0).toUpperCase() || 'U';
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      scheduleModalGlobalSideEffectCleanup();
    }
  }, []);
  // Cross-scope switcher for the scope-specific Settings sidebar: each entry
  // enters a settings scope, whose sidebar then shows only that scope's pages
  // (see buildSettingsMenuItems). Help is part of the personal scope. See #1231.
  const allDropdownItems: DropdownItem[] = [
    { href: APP_ROUTES.SETTINGS.ROOT, icon: HiOutlineUser, label: 'Personal' },
    {
      href: orgHref(APP_ROUTES.SETTINGS.ROOT),
      icon: HiOutlineBuildingOffice2,
      label: 'Organization',
    },
    {
      href: orgHref(APP_ROUTES.SETTINGS.BRANDS),
      icon: HiOutlineTag,
      label: 'Brands',
    },
    {
      href: APP_ROUTES.SETTINGS.HELP,
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
    <DropdownMenu modal={false} open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="size-8 flex-shrink-0 cursor-pointer overflow-hidden rounded-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          ariaLabel="Open account menu"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={userName}
              width={32}
              height={32}
              className="size-8 rounded-md object-cover object-center"
              sizes="32px"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-md bg-foreground/15 font-semibold text-foreground/80">
              {initial}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="font-medium leading-none">{userName}</p>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={APP_ROUTES.LOGOUT} className="cursor-pointer">
            <HiOutlineArrowRightOnRectangle className="size-4" />
            Sign out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
