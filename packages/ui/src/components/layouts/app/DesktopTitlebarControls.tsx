'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useHistoryNavigation } from '@genfeedai/hooks/ui/use-history-navigation/use-history-navigation';
import SidebarLogoToggleButton from '@ui/menus/sidebar-logo-toggle/SidebarLogoToggleButton';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type DesktopTitlebarSidebarToggle = {
  isCollapsed: boolean;
  onToggle: () => void;
};

type DesktopTitlebarControlsProps = {
  /** Shown here only while the traffic lights cover the rail's mark band. */
  sidebarToggle?: DesktopTitlebarSidebarToggle | null;
};

/**
 * Leading edge of the desktop topbar, Codex-style: room for the macOS traffic
 * lights, the sidebar toggle when the lights displace it from the rail, then
 * back / forward. The desktop window has no browser chrome to navigate with.
 */
export default function DesktopTitlebarControls({
  sidebarToggle = null,
}: DesktopTitlebarControlsProps) {
  const router = useRouter();
  const { canGoBack, canGoForward } = useHistoryNavigation();
  const translateWindow = useTranslations('common.windowChrome');
  const translateSidebar = useTranslations('common.sidebar');

  return (
    <div
      data-desktop-drag="true"
      data-testid="desktop-titlebar-controls"
      className="hidden h-full shrink-0 items-center gap-0.5 md:flex"
      // The lights end at a fixed window x; the topbar starts after the rail.
      style={{
        paddingLeft:
          'max(0.25rem, calc(var(--desktop-traffic-lights-inset) - var(--desktop-rail-width)))',
      }}
    >
      {sidebarToggle ? (
        <SidebarLogoToggleButton
          ariaLabel={
            sidebarToggle.isCollapsed
              ? translateSidebar('expand')
              : translateSidebar('collapse')
          }
          direction={sidebarToggle.isCollapsed ? 'expand' : 'collapse'}
          onClick={sidebarToggle.onToggle}
        />
      ) : null}
      <Button
        type="button"
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        className="size-8"
        ariaLabel={translateWindow('back')}
        data-testid="desktop-titlebar-back"
        isDisabled={!canGoBack}
        onClick={() => router.back()}
        tooltip={translateWindow('back')}
        withWrapper={false}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        type="button"
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        className="size-8"
        ariaLabel={translateWindow('forward')}
        data-testid="desktop-titlebar-forward"
        isDisabled={!canGoForward}
        onClick={() => router.forward()}
        tooltip={translateWindow('forward')}
        withWrapper={false}
      >
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
