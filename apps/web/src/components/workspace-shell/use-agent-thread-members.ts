'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { MembersService } from '@services/organization/members.service';
import { useMemo } from 'react';
import type { AgentThreadMember } from '@/components/workspace-shell/props/agent-threads-panel.props';

const EMPTY_MEMBERS: AgentThreadMember[] = [];

/**
 * The organization's active members, by user id, for naming who wrote a message
 * or owns a thread and for picking who to share one with. Shared by the list,
 * the open thread and the share dialog, so it reads once per viewer.
 * `enabled: false` holds the read until a thread is actually shared.
 */
export function useAgentThreadMembers(enabled = true): {
  isLoading: boolean;
  members: readonly AgentThreadMember[];
  membersById: ReadonlyMap<string, AgentThreadMember>;
} {
  const { organizationId } = useBrand();
  const query = useAuthedQuery<MembersService, AgentThreadMember[]>({
    enabled: enabled && Boolean(organizationId),
    queryFn: async (service, signal) => {
      const members = await service.findAllPages({}, signal);
      return members
        .filter((member) => member.isActive && !member.isDeleted)
        .map((member) => ({
          avatarUrl: member.user?.avatar ?? null,
          brandIds: (member.brands ?? []).map((brand) => brand.id),
          name: member.userFullName,
          roleLabel: member.roleLabel ?? null,
          userId: member.userId,
        }));
    },
    queryKey: ['agent-thread-members', organizationId ?? null],
    service: (token: string) => MembersService.getInstance(token),
  });
  const members = query.data ?? EMPTY_MEMBERS;
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );
  return { isLoading: query.isLoading, members, membersById };
}
