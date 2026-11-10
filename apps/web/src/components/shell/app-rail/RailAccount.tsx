'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@ui/primitives/tooltip';
import { CircleQuestionMark, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import UserDropdown from '@/components/menus/user-dropdown/UserDropdown';

const SETTINGS_PATH_PATTERN = /\/settings(?:\/|$)/;

function resolveDisplayName(
  fullName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  emailAddress: string,
): string {
  const trimmedFull = fullName?.trim();
  if (trimmedFull) {
    return trimmedFull;
  }

  const composed = [firstName?.trim(), lastName?.trim()]
    .filter(Boolean)
    .join(' ');
  if (composed) {
    return composed;
  }

  return emailAddress.split('@')[0] || 'User';
}

/**
 * Bottom of the app rail, Codex-style: Settings, Help and the signed-in
 * avatar. The avatar opens the account menu; name and email live in that menu,
 * not beside the avatar.
 */
export default function RailAccount() {
  const translate = useTranslations('common.appRail');
  const { isSignedIn } = useAuthIdentity();
  const { user } = useAuthUser();
  const pathname = usePathname();
  const { orgHref, orgSlug } = useOrgUrl();
  const isSettingsActive = SETTINGS_PATH_PATTERN.test(pathname ?? '');

  const emailAddress = user?.primaryEmailAddress?.emailAddress ?? '';

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid="app-rail-account"
    >
      {orgSlug ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              aria-current={isSettingsActive ? 'page' : undefined}
              aria-label={translate('settings')}
              className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/50 transition-[background-color,color] duration-150',
                'hover:bg-foreground/5 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isSettingsActive && 'bg-foreground/10 text-foreground',
              )}
              data-testid="app-rail-settings"
              href={orgHref(APP_ROUTES.SETTINGS.GENERAL)}
            >
              <Settings aria-hidden="true" className="size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {translate('settings')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            aria-label={translate('help')}
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/50 transition-[background-color,color] duration-150',
              'hover:bg-foreground/5 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            data-testid="app-rail-help"
            href={APP_ROUTES.SETTINGS.HELP}
          >
            <CircleQuestionMark aria-hidden="true" className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {translate('help')}
        </TooltipContent>
      </Tooltip>
      {user && isSignedIn ? (
        <div className="flex size-8 items-center justify-center">
          <UserDropdown
            imageUrl={user.imageUrl}
            side="right"
            userEmail={emailAddress}
            userName={resolveDisplayName(
              user.fullName,
              user.firstName,
              user.lastName,
              emailAddress,
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
