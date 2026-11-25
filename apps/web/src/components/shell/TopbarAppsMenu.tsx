'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { SHELL_CHROME_FOCUS_CLASS } from '@ui-constants/shell-chrome.constant';
import { Download, Monitor, Puzzle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import AppsMenuCliRow from '@/components/shell/apps-menu/AppsMenuCliRow';
import AppsMenuConnectorRow from '@/components/shell/apps-menu/AppsMenuConnectorRow';
import AppsMenuRow from '@/components/shell/apps-menu/AppsMenuRow';
import { useHasAppsBeyondDashboard } from '@/components/shell/use-available-rail-apps';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { useIsMacBrowser } from '@/hooks/ui/use-is-mac-browser/use-is-mac-browser';
import { DESKTOP_DOWNLOAD_URL } from '@/lib/navigation/desktop-links';
import type { TopbarAppsMenuProps } from '@/props/ui/app-rail.props';

/**
 * Apps: the one topbar place to get Genfeed outside the browser. A menu of the
 * Desktop app (Mac browsers only; the build is Apple Silicon and Desktop does
 * not offer itself), the MCP connector and the CLI. When the organization has
 * apps beyond the dashboard it ends with a link to the Apps page.
 */
export default function TopbarAppsMenu({ orgSlug }: TopbarAppsMenuProps) {
  const translate = useTranslations('common.appsMenu');
  const { orgSlug: resolvedOrgSlug } = useOrgUrl();
  const hasAppsBeyondDashboard = useHasAppsBeyondDashboard();
  const isMacBrowser = useIsMacBrowser();
  const isDesktopClient = useIsDesktopClient();
  const [isOpen, setIsOpen] = useState(false);
  const effectiveOrgSlug = orgSlug ?? resolvedOrgSlug;

  const connectHref = effectiveOrgSlug
    ? createOrganizationAppRoute(effectiveOrgSlug, APP_ROUTES.CONNECTORS.AGENTS)
    : null;
  const appsHref = effectiveOrgSlug
    ? createOrganizationAppRoute(effectiveOrgSlug, APP_ROUTES.APPS.ROOT)
    : null;
  const close = () => setIsOpen(false);

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={translate('trigger')}
          className={cn('size-8', SHELL_CHROME_FOCUS_CLASS)}
          data-testid="topbar-apps-menu"
          size={ButtonSize.ICON}
          tooltip={translate('trigger')}
          variant={isOpen ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
          withWrapper={false}
        >
          <Puzzle aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-1rem))] p-0"
        data-testid="apps-menu"
      >
        <div className="divide-y divide-border">
          {isMacBrowser && !isDesktopClient ? (
            <AppsMenuRow
              action={
                <Button
                  asChild
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DEFAULT}
                  withWrapper={false}
                >
                  <a
                    href={DESKTOP_DOWNLOAD_URL}
                    onClick={close}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Download aria-hidden="true" className="size-4" />
                    {translate('desktop.download')}
                  </a>
                </Button>
              }
              icon={Monitor}
              subtitle={translate('desktop.subtitle')}
              testId="apps-row-desktop"
              title={translate('desktop.title')}
            />
          ) : null}

          <AppsMenuConnectorRow connectHref={connectHref} onNavigate={close} />
          <AppsMenuCliRow />

          {hasAppsBeyondDashboard && appsHref ? (
            <div className="flex items-center justify-between p-2">
              <span className="px-1 text-xs text-muted-foreground">
                {translate('more.label')}
              </span>
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                <Link
                  data-testid="apps-menu-open-apps"
                  href={appsHref}
                  onClick={close}
                >
                  {translate('more.action')}
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
