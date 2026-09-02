import { INTERNAL_CREDIT_COSTS } from '@genfeedai/pricing';

export type ManagedInferenceComputeJobKind = 'voice-clone';

export const MANAGED_INFERENCE_COMPUTE_CREDIT_RATES: Record<
  ManagedInferenceComputeJobKind,
  { creditsPerSecond: number; description: string }
> = {
  'voice-clone': {
    creditsPerSecond: INTERNAL_CREDIT_COSTS.voicePerMinute / 60,
    description: 'Managed inference voice clone compute',
  },
};

export function calculateManagedInferenceComputeCredits(params: {
  jobKind: ManagedInferenceComputeJobKind;
  processTimeSeconds: number;
}): number {
  const seconds = Number(params.processTimeSeconds);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  const rate =
    MANAGED_INFERENCE_COMPUTE_CREDIT_RATES[params.jobKind].creditsPerSecond;
  return Math.max(1, Math.ceil(seconds * rate));
}
