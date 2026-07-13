'use client';

import { AgentApiService, AgentFullPage } from '@genfeedai/agent';
import { isEEEnabled } from '@genfeedai/config/license';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAgentBrandCreate } from '@hooks/agent/use-agent-brand-create';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useUserRole } from '@hooks/auth/use-user-role';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCallback, useMemo } from 'react';

export interface AgentPageContentProps {
  authReady?: boolean;
  onboardingMode?: boolean;
  onOnboardingCompleted?: () => void | Promise<void>;
  onOAuthConnect?: (platform: string) => void;
  threadId?: string;
}

export default function AgentPageContent({
  authReady = true,
  onboardingMode,
  onOnboardingCompleted,
  onOAuthConnect,
  threadId,
}: AgentPageContentProps) {
  const { getToken } = useAuthIdentity();
  const userRole = useUserRole();
  const { orgHref } = useOrgUrl();
  const handleBrandCreate = useAgentBrandCreate();
  const agentApiService = useMemo(
    () =>
      new AgentApiService({
        baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
        getToken: async (options) => resolveAuthToken(getToken, options),
      }),
    [getToken],
  );
  const handleNavigateToBilling = useCallback(() => {
    window.open(
      orgHref(isEEEnabled() ? '/settings/billing' : '/settings/credits'),
      '_self',
    );
  }, [orgHref]);

  const handleSelectCreditPack = useCallback(
    (pack: { label: string; price: string; credits: number }) => {
      window.open(
        isEEEnabled()
          ? orgHref(`/settings/billing?pack=${pack.label.toLowerCase()}`)
          : orgHref('/settings/credits'),
        '_self',
      );
    },
    [orgHref],
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col">
      <AgentFullPage
        apiService={agentApiService}
        authReady={authReady}
        onboardingMode={onboardingMode}
        onOnboardingCompleted={onOnboardingCompleted}
        onOAuthConnect={onOAuthConnect}
        onBrandCreate={handleBrandCreate}
        onSelectCreditPack={handleSelectCreditPack}
        onNavigateToBilling={handleNavigateToBilling}
        threadId={threadId}
        userRole={userRole}
      />
    </div>
  );
}
