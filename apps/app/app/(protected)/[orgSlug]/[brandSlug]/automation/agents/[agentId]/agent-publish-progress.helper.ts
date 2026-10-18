import { formatPlatformLabel } from '@genfeedai/contracts';
import type { AgentPlatformApprovalProgress } from '@props/automation/agent-strategy-publish-toggles.props';
import type { AgentStrategyPublishPolicy } from '@services/automation/agent-strategies.service';

/** The server's graduation threshold when a strategy stores none (#4964). */
export const DEFAULT_APPROVALS_TO_GRADUATE = 5;

export const APPROVALS_TO_GRADUATE_OPTIONS = [3, 5, 10, 20] as const;

/** Mirrors the server bounds: an integer from 1 to 100, else the default. */
export function readApprovalsToGraduate(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 100
    ? value
    : DEFAULT_APPROVALS_TO_GRADUATE;
}

/** The threshold choices, keeping a stored value that is not a preset. */
export function approvalsToGraduateChoices(current: number): number[] {
  return [...new Set([...APPROVALS_TO_GRADUATE_OPTIONS, current])].sort(
    (left, right) => left - right,
  );
}

/**
 * Configured platforms first, then any platform with a recorded streak, each
 * once. Decision keys stay on the server record and are never displayed.
 */
export function buildPlatformApprovalProgress(
  platforms: readonly string[],
  platformStates: AgentStrategyPublishPolicy['platformStates'],
): AgentPlatformApprovalProgress[] {
  const states = platformStates ?? {};
  return [...new Set([...platforms, ...Object.keys(states).sort()])].map(
    (platform) => {
      const state = states[platform];
      const streak = state?.approvalStreak;
      return {
        approvalStreak:
          typeof streak === 'number' && Number.isInteger(streak) && streak >= 0
            ? streak
            : 0,
        isGraduated: state?.autoPublishEnabled === true,
        label: formatPlatformLabel(platform) ?? platform,
        platform,
      };
    },
  );
}
