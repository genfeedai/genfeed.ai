import type {
  IOnboardingAnswerFieldProgress,
  IOnboardingAnswersProgress,
  OnboardingAnswerFieldId,
} from '@genfeedai/contracts/interfaces';
import { ONBOARDING_ANSWER_FIELD_IDS } from '@genfeedai/contracts/types';
import { readRecordOrNull } from '@genfeedai/utils/data/extract.util';

function readFieldProgress(
  value: unknown,
): IOnboardingAnswerFieldProgress | undefined {
  const record = readRecordOrNull(value);
  if (
    !record ||
    (record.status !== 'answered' && record.status !== 'skipped') ||
    typeof record.updatedAt !== 'string'
  )
    return undefined;
  return { status: record.status, updatedAt: record.updatedAt };
}

/**
 * Reads the onboarding card progress from a brand's stored `agentConfig`
 * (`onboardingAnswers`) and whether a URL scan prefilled it (`signupPrefill`).
 * Unknown or malformed entries are dropped, never trusted.
 */
export function readOnboardingAnswersProgress(
  agentConfig: unknown,
): IOnboardingAnswersProgress {
  const config = readRecordOrNull(agentConfig);
  const stored = readRecordOrNull(config?.onboardingAnswers);
  const storedFields = readRecordOrNull(stored?.fields);
  const prefill = readRecordOrNull(config?.signupPrefill);
  const fields: Partial<
    Record<OnboardingAnswerFieldId, IOnboardingAnswerFieldProgress>
  > = {};
  for (const fieldId of ONBOARDING_ANSWER_FIELD_IDS) {
    const progress = readFieldProgress(storedFields?.[fieldId]);
    if (progress) fields[fieldId] = progress;
  }
  return {
    fields,
    hasScannedWebsite:
      prefill?.status === 'completed' && prefill.hasScrapedWebsite === true,
    ...(stored?.voiceSource === 'instagram'
      ? { voiceSource: 'instagram' as const }
      : {}),
  };
}
