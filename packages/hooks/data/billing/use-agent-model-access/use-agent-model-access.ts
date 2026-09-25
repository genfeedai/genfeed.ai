'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  IAgentModelAccess,
  UseAgentModelAccessReturn,
} from '@genfeedai/contracts/interfaces';
import { AgentCreditsService } from '@genfeedai/services/automation/agent-credits.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';

const AGENT_MODEL_ACCESS_STALE_TIME_MS = 60_000;
const EMPTY_MODEL_COSTS: Record<string, number> = {};

/**
 * Agent chat model entitlement for the active organization: whether the
 * free-tier lock pins every agent turn to one model, plus the estimated
 * credits per message for each selectable model.
 */
export function useAgentModelAccess(): UseAgentModelAccessReturn {
  const { organizationId } = useBrand();
  const getAgentCreditsService = useAuthedService((token: string) =>
    AgentCreditsService.getInstance(token),
  );

  const { data, isPending } = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async ({ signal }) => {
      const service = await getAgentCreditsService();
      return service.getCreditsInfo(signal);
    },
    queryKey: ['agent-model-access', organizationId ?? 'no-org'],
    staleTime: AGENT_MODEL_ACCESS_STALE_TIME_MS,
  });

  const modelAccess: IAgentModelAccess | null = data?.modelAccess ?? null;

  return {
    isLoading: Boolean(organizationId) && isPending,
    modelAccess,
    modelCosts: data?.modelCosts ?? EMPTY_MODEL_COSTS,
  };
}
