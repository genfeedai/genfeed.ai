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
import { SHELL_CHROME_FOCUS_CLASS } from '@ui-constants/shell-chrome.constant';
import {
  CircleQuestionMark,
  type LucideIcon,
  Plug,
  Puzzle,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import UserDropdown from '@/components/menus/user-dropdown/UserDropdown';
import { useHasAppsBeyondDashboard } from '@/components/shell/use-available-rail-apps';

const SETTINGS_PATH_PATTERN = /\/settings(?:\/|$)/;
/** `/:org/~/apps` and `/:org/:brand/apps`, the page that lists every app. */
const APPS_PATH_PATTERN = /^\/[^/]+\/[^/]+\/apps(?:\/|$)/;
/** `/:org/~/connectors/*` and `/:org/:brand/connectors/*`. */
const CONNECTORS_PATH_PATTERN = /^\/[^/]+\/[^/]+\/connectors(?:\/|$)/;

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
            'hover:bg-foreground/5 hover:text-foreground',
            SHELL_CHROME_FOCUS_CLASS,
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
 * Bottom of the app rail, Codex-style: Apps, Connectors, Settings, Help and
 * the signed-in avatar. Apps is the page that lists every app the organization
 * has, shown once there is any beyond the dashboard. Connectors is where everything an organization connects
 * lives (agents, channels, AI providers, API keys, webhooks). The avatar opens
 * the account menu.
 */
export default function RailAccount() {
  const translate = useTranslations('common.appRail');
  const pathname = usePathname();
  const { activeHref, orgHref, orgSlug } = useOrgUrl();
  const hasAppsBeyondDashboard = useHasAppsBeyondDashboard();
  const isAppsActive = APPS_PATH_PATTERN.test(pathname ?? '');
  const isConnectorsActive = CONNECTORS_PATH_PATTERN.test(pathname ?? '');
  const { isSignedIn } = useAuthIdentity();
  const { user } = useAuthUser();
  const isSettingsActive = SETTINGS_PATH_PATTERN.test(pathname ?? '');

  const emailAddress = user?.primaryEmailAddress?.emailAddress ?? '';

  return (
    <div
      className="flex flex-col items-center gap-1"
      data-testid="app-rail-account"
    >
      {orgSlug && hasAppsBeyondDashboard ? (
        <RailLink
          href={orgHref(APP_ROUTES.APPS.ROOT)}
          icon={Puzzle}
          isActive={isAppsActive}
          label={translate('apps')}
          testId="app-rail-apps"
        />
      ) : null}
      <RailLink
        href={activeHref(APP_ROUTES.CONNECTORS.AGENTS)}
        icon={Plug}
        isActive={isConnectorsActive}
        label={translate('connectors')}
        testId="app-rail-connectors"
      />
      {orgSlug ? (
        <RailLink
          href={orgHref(APP_ROUTES.SETTINGS.GENERAL)}
          icon={Settings}
          isActive={isSettingsActive}
          label={translate('settings')}
          testId="app-rail-settings"
        />
      ) : null}
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
