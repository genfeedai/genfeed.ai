import { fireEvent, render, screen } from '@testing-library/react';
import type AppSidebar from '@ui/shell/menus/AppSidebar';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProtectedLayoutSidebar from './AppProtectedLayoutSidebar';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));
vi.mock(
  '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client',
  () => ({
    useIsDesktopClient: () => false,
  }),
);
vi.mock('./useOpenTaskComposer', () => ({
  useOpenTaskComposer: () => vi.fn(),
}));
vi.mock('@ui/shell/menus/AppSidebar', () => ({
  default: ({ onClose, items }: ComponentProps<typeof AppSidebar>) => (
    <button type="button" onClick={onClose}>
      {items[0]?.label}
    </button>
  ),
}));

const baseProps: ComponentProps<typeof AppProtectedLayoutSidebar> = {
  isAdminRoute: false,
  isAnalyticsRoute: false,
  isConversationRoute: false,
  isFocusedOnboardingRoute: false,
  isLibraryRoute: false,
  isOrgRoute: false,
  isPublishingRoute: false,
  isDiscoveryRoute: false,
  isSettingsRoute: false,
  isStudioRoute: false,
  isAutomationRoute: false,
  adminMenuItems: [],
  analyticsMenuItems: [],
  libraryMenuItems: [],
  menuItems: [{ href: '/publishing/posts', label: 'Posts' }],
  orgMenuItems: [],
  publishingMenuItems: [{ href: '/publishing/posts', label: 'Posts' }],
  discoveryMenuItems: [],
  secondaryMenuItems: [],
  settingsMenuItems: [],
  studioMenuItems: [],
  automationMenuItems: [],
  messagesMenuItems: [],
};

describe('mobile module navigation', () => {
  it.each([true, false])(
    'closes the drawer for publishing surface=%s',
    (isPublishingRoute) => {
      const onClose = vi.fn();
      render(
        <AppProtectedLayoutSidebar
          {...baseProps}
          isPublishingRoute={isPublishingRoute}
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Posts' }));
      expect(onClose).toHaveBeenCalledOnce();
    },
  );
});
