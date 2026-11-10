'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@ui/primitives/tooltip';
import { CircleQuestionMark, type LucideIcon, Plug } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import UserDropdown from '@/components/menus/user-dropdown/UserDropdown';

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

interface RailLinkProps {
  href: string;
  icon: LucideIcon;
  isActive?: boolean;
  label: string;
  testId: string;
}

/** One icon link in the rail's bottom group, with its label as the tooltip. */
function RailLink({
  href,
  icon: Icon,
  isActive = false,
  label,
  testId,
}: RailLinkProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          aria-current={isActive ? 'page' : undefined}
          aria-label={label}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150',
            'hover:bg-foreground/5 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isActive ? 'bg-foreground/5 text-foreground' : 'text-foreground/50',
          )}
          data-testid={testId}
          href={href}
        >
          <Icon aria-hidden="true" className="size-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Bottom of the app rail, Codex-style: Connectors, Help and the signed-in
 * avatar. Connectors is where everything an organization connects lives
 * (agents, channels, AI providers, API keys, webhooks). The
 * avatar opens the account menu; name and email live in that menu, not beside
 * the avatar.
 */
export default function RailAccount() {
  const translate = useTranslations('common.appRail');
  const pathname = usePathname();
  const { orgHref } = useOrgUrl();
  const isConnectorsActive = Boolean(pathname?.includes('/~/connectors'));
  const { isSignedIn } = useAuthIdentity();
  const { user } = useAuthUser();

  const emailAddress = user?.primaryEmailAddress?.emailAddress ?? '';

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid="app-rail-account"
    >
      <RailLink
        href={orgHref(APP_ROUTES.CONNECTORS.AGENTS)}
        icon={Plug}
        isActive={isConnectorsActive}
        label={translate('connectors')}
        testId="app-rail-connectors"
      />
      <RailLink
        href={APP_ROUTES.SETTINGS.HELP}
        icon={CircleQuestionMark}
        label={translate('help')}
        testId="app-rail-help"
      />
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
