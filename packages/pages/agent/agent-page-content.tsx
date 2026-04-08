'use client';

import { useAuth } from '@clerk/nextjs';
import { AgentApiService, AgentFullPage } from '@genfeedai/agent';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useUserRole } from '@hooks/auth/use-user-role';
import { useCallback, useMemo } from 'react';
import { isEEEnabled } from '@/lib/config/edition';

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
  const { getToken } = useAuth();
  const userRole = useUserRole();
  const agentApiService = useMemo(
    () =>
      new AgentApiService({
        baseUrl: process.env.NEXT_PUBLIC_API_ENDPOINT ?? '',
        getToken: async () => resolveClerkToken(getToken),
      }),
    [getToken],
  );
  const handleNavigateToBilling = useCallback(() => {
    window.open(
      isEEEnabled()
        ? '/settings/organization/billing'
        : '/settings/organization/api-keys',
      '_self',
    );
  }, []);

  const handleSelectCreditPack = useCallback(
    (pack: { label: string; price: string; credits: number }) => {
      window.open(
        isEEEnabled()
          ? `/settings/organization/billing?pack=${pack.label.toLowerCase()}`
          : '/settings/organization/api-keys',
        '_self',
      );
    },
    [],
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col">
      <AgentFullPage
        apiService={agentApiService}
        authReady={authReady}
        onboardingMode={onboardingMode}
        onOnboardingCompleted={onOnboardingCompleted}
        onOAuthConnect={onOAuthConnect}
        onSelectCreditPack={handleSelectCreditPack}
        onNavigateToBilling={handleNavigateToBilling}
        threadId={threadId}
        userRole={userRole}
      />
    </div>
  );
}
