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
}

export default function UserDropdown({
  userName,
  userEmail,
}: UserDropdownProps) {
  const { orgHref } = useOrgUrl();
  const dropdownItems: DropdownItem[] = [
    { href: '/settings', icon: HiOutlineUser, label: 'Personal' },
    {
      href: orgHref('/settings'),
      icon: HiOutlineBuildingOffice2,
      label: 'Organization',
    },
    { href: orgHref('/settings/brands'), icon: HiOutlineTag, label: 'Brands' },
    {
      href: orgHref('/settings/help'),
      icon: HiOutlineQuestionMarkCircle,
      label: 'Help',
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors flex-shrink-0 cursor-pointer"
          ariaLabel="Settings"
        >
          <HiOutlineCog6Tooth className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
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
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
