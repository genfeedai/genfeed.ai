import { INTERNAL_CREDIT_COSTS } from '@genfeedai/pricing';

export type FleetComputeJobKind = 'voice-clone';

export const FLEET_COMPUTE_CREDIT_RATES: Record<
  FleetComputeJobKind,
  { creditsPerSecond: number; description: string }
> = {
  'voice-clone': {
    creditsPerSecond: INTERNAL_CREDIT_COSTS.voicePerMinute / 60,
    description: 'Fleet voice clone compute',
  },
};

export function calculateFleetComputeCredits(params: {
  jobKind: FleetComputeJobKind;
  processTimeSeconds: number;
}): number {
  const seconds = Number(params.processTimeSeconds);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  const rate = FLEET_COMPUTE_CREDIT_RATES[params.jobKind].creditsPerSecond;
  return Math.max(1, Math.ceil(seconds * rate));
}
