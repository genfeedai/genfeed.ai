import {
  AgentFullPage,
  useAgentChatStore,
  useConversationComposerShell,
} from '@genfeedai/agent';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { useAgentBrandCreate } from '@genfeedai/hooks/agent/use-agent-brand-create';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { BrandKnowledgeSelection } from '@props/content/knowledge-library.props';
import { TasksService } from '@services/management/tasks.service';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { AgentWorkspacePageShellProps } from '@/features/agents/props/agent-workspace-page-shell.props';
import KnowledgeReferenceSection from '@/features/library/knowledge/components/KnowledgeReferenceSection';
import { useAgentWorkspace } from './agent-workspace-context';

const EMPTY_KNOWLEDGE_SELECTION: KnowledgeSelection = {};

export function AgentWorkspacePageShell({
  threadId,
}: AgentWorkspacePageShellProps) {
  const { push } = useRouter();
  const { orgHref } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const { agentApiService, isLoaded, handleOAuthConnect } = useAgentWorkspace();
  const handleBrandCreate = useAgentBrandCreate();
  // Knowledge is picked for the brand the next turn runs under: the composer's
  // brand when it sets one (new threads adopt it), otherwise the open thread's.
  const composerShell = useConversationComposerShell();
  const activeThreadBrandId = useAgentChatStore(
    (state) =>
      state.threads.find((thread) => thread.id === state.activeThreadId)
        ?.brandId ?? undefined,
  );
  const knowledgeBrandId = composerShell?.brandId ?? activeThreadBrandId;
  const [brandKnowledgeSelection, setBrandKnowledgeSelection] =
    useState<BrandKnowledgeSelection>({
      brandId: undefined,
      value: EMPTY_KNOWLEDGE_SELECTION,
    });
  // A selection made under another brand is never sent: switching brand
  // empties it instead of widening the next turn to foreign sources.
  const knowledgeSelection =
    brandKnowledgeSelection.brandId === knowledgeBrandId
      ? brandKnowledgeSelection.value
      : EMPTY_KNOWLEDGE_SELECTION;
  const handleKnowledgeSelectionChange = useCallback(
    (value: KnowledgeSelection) => {
      setBrandKnowledgeSelection({ brandId: knowledgeBrandId, value });
    },
    [knowledgeBrandId],
  );
  const handleCreateFollowUpTasks = useCallback(
    async (taskId: string) => {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error('Authentication token unavailable.');
      }

      const service = TasksService.getInstance(token);
      const createdTasks = await service.createChildTasks(taskId);

      return {
        createdCount: createdTasks.length,
      };
    },
    [getToken],
  );

  // These callbacks are drilled down to `AgentChatMessage` (`React.memo`-wrapped,
  // see #2517) for every message row. An inline arrow would be a fresh
  // reference on every render of this shell, defeating that memoization for
  // the entire conversation history, so stabilize them with `useCallback`.
  const handleNavigateToBilling = useCallback(() => {
    push(orgHref('/settings/credits'));
  }, [push, orgHref]);

  // #4670 Open in Studio: the card already built the full, org-scoped Studio
  // generate URL (including the handoff id) via its own useOrgUrl() — this
  // just navigates, same as the billing callbacks above.
  const handleOpenInStudio = useCallback(
    (studioUrl: string) => {
      push(studioUrl);
    },
    [push],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <AgentFullPage
        apiService={agentApiService}
        authReady={isLoaded}
        knowledgeSection={
          <KnowledgeReferenceSection
            brandId={knowledgeBrandId}
            key={knowledgeBrandId ?? 'no-brand'}
            onChange={handleKnowledgeSelectionChange}
            value={knowledgeSelection}
          />
        }
        knowledgeSelection={knowledgeSelection}
        newChatHref={orgHref('/agent/new')}
        onCreateFollowUpTasks={handleCreateFollowUpTasks}
        showThreadSidebar={false}
        threadId={threadId}
        onNavigateToBilling={handleNavigateToBilling}
        onOAuthConnect={handleOAuthConnect}
        onBrandCreate={handleBrandCreate}
        onOpenInStudio={handleOpenInStudio}
      />
    </div>
  );
}
