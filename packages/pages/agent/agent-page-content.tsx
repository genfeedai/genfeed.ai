'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AgentApiService, AgentFullPage } from '@genfeedai/agent';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAgentBrandCreate } from '@hooks/agent/use-agent-brand-create';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useUserRole } from '@hooks/auth/use-user-role';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import KnowledgeContextPicker from '@pages/library/knowledge/components/KnowledgeContextPicker';
import { useCallback, useMemo, useState } from 'react';

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
  const { brandId: activeBrandId } = useBrand();
  const [knowledgeSelection, setKnowledgeSelection] =
    useState<KnowledgeSelection>({});
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
    window.open(orgHref('/settings/credits'), '_self');
  }, [orgHref]);

  const handleSelectCreditPack = useCallback(
    (pack: { label: string; price: string; credits: number }) => {
      window.open(
        orgHref(`/settings/credits?pack=${pack.label.toLowerCase()}`),
        '_self',
      );
    },
    [orgHref],
  );

  // #4670 Open in Studio: the card already built the full, org-scoped Studio
  // generate URL (including the handoff id) via its own useOrgUrl() — this
  // just navigates, same as the other Agent -> elsewhere jumps in this file.
  const handleOpenInStudio = useCallback((studioUrl: string) => {
    window.open(studioUrl, '_self');
  }, []);

  return (
    // Fill the locked conversation shell (see AppLayout lockViewportHeight).
    // Do not use min-h-[100vh-…] — with the credits banner that overflows the
    // viewport and stacks a document scrollbar on top of the thread scroller.
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <AgentFullPage
        apiService={agentApiService}
        knowledgePicker={
          <KnowledgeContextPicker
            brandId={activeBrandId || undefined}
            onChange={setKnowledgeSelection}
            value={knowledgeSelection}
          />
        }
        knowledgeSelection={knowledgeSelection}
        authReady={authReady}
        onboardingMode={onboardingMode}
        onOnboardingCompleted={onOnboardingCompleted}
        onOAuthConnect={onOAuthConnect}
        onBrandCreate={handleBrandCreate}
        onOpenInStudio={handleOpenInStudio}
        onSelectCreditPack={handleSelectCreditPack}
        onNavigateToBilling={handleNavigateToBilling}
        threadId={threadId}
        userRole={userRole}
      />
    </div>
  );
}
