'use client';

import { ButtonVariant, PlatformRole } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { AdminUserDetailSheetProps } from '@props/admin/admin-user.props';
import { Button } from '@ui/primitives/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { VenetianMask } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import UserAvatar from './user-avatar';
import UserDetails from './user-details';
import { EMPTY_VALUE, getUserDisplayName } from './user-display.helpers';

/** Quick look at a user from the list; the full page lives at `.../users/:id`. */
export default function UserDetailSheet({
  user,
  onClose,
  onImpersonate,
}: AdminUserDetailSheetProps) {
  const translate = useTranslations('pages.adminUsers');

  return (
    <Sheet
      open={user !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {user ? (
          <div className="space-y-6">
            <SheetHeader className="pr-8">
              <div className="flex items-center gap-3">
                <UserAvatar className="size-10" user={user} />
                <div className="min-w-0">
                  <SheetTitle className="truncate">
                    {getUserDisplayName(user) ?? EMPTY_VALUE}
                  </SheetTitle>
                  <SheetDescription className="truncate">
                    {user.email || EMPTY_VALUE}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <NextLink
                  href={`${APP_ROUTES.ADMIN.ADMINISTRATION.USERS}/${user.id}`}
                >
                  {translate('openProfile')}
                </NextLink>
              </Button>
              {user.platformRole !== PlatformRole.SUPERADMIN ? (
                <Button
                  icon={<VenetianMask />}
                  label={translate('impersonate')}
                  onClick={() => onImpersonate(user)}
                  variant={ButtonVariant.SECONDARY}
                />
              ) : null}
            </div>

            <UserDetails user={user} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
