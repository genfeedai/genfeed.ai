'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { SHELL_CHROME_FOCUS_CLASS } from '@ui-constants/shell-chrome.constant';
import {
  Activity,
  BarChart3,
  ExternalLink,
  Eye,
  Link2,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  ReleaseDrawerView,
  ReleaseViewSwitcherProps,
} from '@/features/posts/props/release-drawer.props';

const PRIMARY_VIEWS = [
  { icon: Eye, id: 'preview' },
  { icon: SlidersHorizontal, id: 'details' },
  { icon: BarChart3, id: 'analytics' },
] as const satisfies readonly { icon: typeof Eye; id: ReleaseDrawerView }[];

/**
 * Icon-only view switcher for the sidebar header, the same pattern as the
 * topbar panel toggles: 32px ghost buttons on a 36px pitch, the open view
 * pressed. Rarer views and actions sit behind the "..." menu. There is no tab
 * strip; the panel header's toggle closes the panel.
 */
export default function ReleaseViewSwitcher({
  activeView,
  editorHref,
  onViewChange,
}: ReleaseViewSwitcherProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  async function copyLink() {
    setIsLinkCopied(
      await ClipboardService.getInstance().copyToClipboard(
        window.location.href,
        { isSilent: true },
      ),
    );
  }

  return (
    <div
      aria-label={translate('views.label')}
      className="flex shrink-0 items-center gap-1"
      data-testid="release-view-switcher"
      role="toolbar"
    >
      {PRIMARY_VIEWS.map(({ icon: Icon, id }) => {
        const isActive = id === activeView;
        const label = translate(`views.${id}`);
        return (
          // ui-guard-allow:selection-button -- icon-only view switcher in the sidebar header, the same borderless pattern as the topbar panel toggles; a SegmentedControl draws the grouped border this replaces
          <Button
            ariaLabel={label}
            aria-pressed={isActive}
            className={cn('size-8', SHELL_CHROME_FOCUS_CLASS)}
            key={id}
            onClick={() => onViewChange(id)}
            size={ButtonSize.ICON}
            tooltip={label}
            variant={isActive ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Icon className="size-4" />
          </Button>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* ui-guard-allow:selection-button -- shows the History view open, like the icon buttons beside it */}
          <Button
            ariaLabel={translate('views.more')}
            className={cn('size-8', SHELL_CHROME_FOCUS_CLASS)}
            size={ButtonSize.ICON}
            tooltip={translate('views.more')}
            variant={
              activeView === 'history'
                ? ButtonVariant.SECONDARY
                : ButtonVariant.GHOST
            }
            withWrapper={false}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onViewChange('history')}>
            <Activity className="size-4" />
            {translate('views.history')}
          </DropdownMenuItem>
          {editorHref ? (
            <DropdownMenuItem asChild>
              <Link href={editorHref}>
                <ExternalLink className="size-4" />
                {translate('openEditor')}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void copyLink();
            }}
          >
            <Link2 className="size-4" />
            {isLinkCopied
              ? translate('views.linkCopied')
              : translate('views.copyLink')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
