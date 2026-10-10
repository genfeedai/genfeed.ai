import type {
  IOnboardingAnswersProgress,
  OnboardingAnswerFieldId,
} from '@genfeedai/contracts/interfaces';
import {
  ONBOARDING_ANSWER_FIELD_IDS,
  ONBOARDING_ANSWER_REWARD_CREDITS,
} from '@genfeedai/contracts/types';
import type {
  OnboardingBrandContextPanel,
  OnboardingBrandContextRow,
} from '@genfeedai/props/ui/agent/agent-onboarding.props';

const FIELD_LABELS: Record<OnboardingAnswerFieldId, string> = {
  audience: 'Audience',
  cadence: 'Cadence',
  competitors: 'Competitors',
  goals: 'Goal',
  offer: 'Offer',
  platforms: 'Platforms',
  tone: 'Tone',
};

/**
 * Website row plus one row per onboarding card, in the order the agent asks
 * them. The first row without an answer or skip is the one being asked now.
 */
export function buildOnboardingBrandContextPanel(
  score: number | null,
  progress: IOnboardingAnswersProgress | null,
): OnboardingBrandContextPanel {
  const hasStartedCards = Object.keys(progress?.fields ?? {}).length > 0;
  const rows: OnboardingBrandContextRow[] = [
    {
      id: 'website',
      label: 'Website',
      status: progress?.hasScannedWebsite
        ? 'done'
        : hasStartedCards
          ? 'skipped'
          : 'todo',
    },
    ...ONBOARDING_ANSWER_FIELD_IDS.map((fieldId) => {
      const status = progress?.fields[fieldId]?.status;
      return {
        id: fieldId,
        isRewardEarned: status === 'answered',
        label: FIELD_LABELS[fieldId],
        rewardCredits: ONBOARDING_ANSWER_REWARD_CREDITS,
        status:
          status === 'answered'
            ? ('done' as const)
            : status === 'skipped'
              ? ('skipped' as const)
              : ('todo' as const),
      };
    }),
  ];
  const nowIndex = rows.findIndex((row) => row.status === 'todo');
  if (nowIndex !== -1) rows[nowIndex] = { ...rows[nowIndex], status: 'now' };
  return {
    creditsEarned:
      rows.filter((row) => row.isRewardEarned).length *
      ONBOARDING_ANSWER_REWARD_CREDITS,
    rows,
    score,
  };
}
