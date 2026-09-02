'use client';

import type {
  CreateEngagementRuleInput,
  IEngagementRule,
  UpdateEngagementRuleInput,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  UseEngagementRulesOptions,
  UseEngagementRulesResult,
} from '@props/scheduler/engagement-rules.props';
import { EngagementRulesService } from '@services/content/engagement-rules.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

export const ENGAGEMENT_RULES_QUERY_KEY = 'engagement-rules';

export function useEngagementRules(
  options: UseEngagementRulesOptions = {},
): UseEngagementRulesResult {
  const { autoLoad = true, postGroupId, targetId } = options;
  const { isSignedIn } = useAuthIdentity();
  const queryClient = useQueryClient();

  const getService = useAuthedService((token: string) =>
    EngagementRulesService.getInstance(token),
  );

  const queryKey = useMemo(
    () => [ENGAGEMENT_RULES_QUERY_KEY, postGroupId, targetId],
    [postGroupId, targetId],
  );

  const {
    data = [],
    error,
    isLoading,
    refetch,
  } = useQuery<IEngagementRule[]>({
    enabled: autoLoad && !!isSignedIn && !!postGroupId && !!targetId,
    queryFn: async ({ signal }) => {
      if (!postGroupId || !targetId) {
        return [];
      }
      const service = await getService();
      return service.findAll(
        {
          postGroupId,
          targetId,
        },
        signal,
      );
    },
    queryKey,
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [ENGAGEMENT_RULES_QUERY_KEY],
    });
  }, [queryClient]);

  const create = useCallback(
    async (input: CreateEngagementRuleInput): Promise<IEngagementRule> => {
      const service = await getService();
      const created = await service.post(input);
      await invalidate();
      return created;
    },
    [getService, invalidate],
  );

  const update = useCallback(
    async (
      id: string,
      input: UpdateEngagementRuleInput,
    ): Promise<IEngagementRule> => {
      const service = await getService();
      const updated = await service.patch(id, input);
      await invalidate();
      return updated;
    },
    [getService, invalidate],
  );

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    create,
    error: error instanceof Error ? error : null,
    isLoading,
    refresh,
    rules: data,
    update,
  };
}
