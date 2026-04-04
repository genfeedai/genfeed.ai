'use client';

import { useAuth } from '@clerk/nextjs';
import { AgentApiService, useAgentChatStore } from '@genfeedai/agent';
import { CommandPalette } from '@components/command-palette/command-palette/CommandPalette';
import { CommandPaletteInitializer } from '@components/command-palette/command-palette-initializer/CommandPaletteInitializer';
import AppLayout from '@components/layouts/app/AppLayout';
import AdminSidebar from '@components/shell/menus/AdminSidebar';
import AdminTopbar from '@components/shell/topbars/AdminTopbar';
import { ADMIN_LOGO_HREF, ADMIN_MENU_ITEMS } from '@config/menu-items.config';
import { CommandPaletteProvider } from '@contexts/features/command-palette.context';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useAdminNavigationCommands } from '@hooks/commands/use-admin-navigation-commands/use-admin-navigation-commands';
import type { LayoutProps } from '@props/layout/layout.props';
import ProtectedProviders from '@providers/protected-providers/protected-providers';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

function AdminNavigationRegistrar(): null {
  useAdminNavigationCommands();
  return null;
}

function useAdminAgentApiService(): AgentApiService {
  const { getToken } = useAuth();

  return useMemo(
    () =>
      new AgentApiService({
        baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
        getToken: async () => resolveClerkToken(getToken),
      }),
    [getToken],
  );
}

type AgentPanelProps = {
  apiService: AgentApiService;
  onNavigateToBilling?: () => void;
  onOAuthConnect?: (platform: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
};

const LazyAgentPanel = dynamic<AgentPanelProps>(
  () => import('@genfeedai/agent').then((mod) => mod.AgentPanel),
  {
    loading: () => (
      <div data-prompt-layout-mode="surface-fixed" data-testid="agent-panel" />
    ),
    ssr: false,
  },
);

function AdminShellLayout({ children }: LayoutProps) {
  const pathname = usePathname();
  const agentApiService = useAdminAgentApiService();
  const isAgentOpen = useAgentChatStore((s) => s.isOpen);
  const toggleAgent = useAgentChatStore((s) => s.toggleOpen);
  const isAgentWorkspaceRoute =
    pathname === '/agent' || pathname.startsWith('/agent/');

  return (
    <AppLayout
      menuComponent={
        <AdminSidebar items={ADMIN_MENU_ITEMS} logoHref={ADMIN_LOGO_HREF} />
      }
      topbarComponent={(props) => <AdminTopbar {...props} />}
      menuItems={ADMIN_MENU_ITEMS}
      agentPanel={
        isAgentWorkspaceRoute ? null : (
          <LazyAgentPanel apiService={agentApiService} />
        )
      }
      isAgentCollapsed={isAgentWorkspaceRoute ? true : !isAgentOpen}
      onAgentToggle={isAgentWorkspaceRoute ? undefined : toggleAgent}
    >
      {children}
    </AppLayout>
  );
}

export default function ProtectedLayout({ children }: LayoutProps) {
  return (
    <ProtectedProviders includeBrandProvider={false}>
      <CommandPaletteProvider>
        <CommandPaletteInitializer />
        <AdminNavigationRegistrar />
        <AdminShellLayout>{children}</AdminShellLayout>
        <CommandPalette />
      </CommandPaletteProvider>
    </ProtectedProviders>
  );
}
