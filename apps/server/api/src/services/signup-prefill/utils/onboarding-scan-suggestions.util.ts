import type {
  IBrandVoiceAnalysis,
  IOnboardingScanSuggestions,
} from '@genfeedai/contracts/interfaces';

/**
 * Card suggestions a scan's brand-voice analysis proposes, capped to what the
 * onboarding cards show. The scan returns them to the onboarding conversation
 * and stores them on the prefill marker for in-flow asks after onboarding.
 */
export function toOnboardingScanSuggestions(
  brandVoice: IBrandVoiceAnalysis | undefined,
): IOnboardingScanSuggestions {
  return {
    audiences: (brandVoice?.audienceSegments ?? []).slice(0, 4),
    offers: (brandVoice?.offers ?? []).slice(0, 4),
    competitors: (brandVoice?.competitors ?? []).slice(0, 3),
  };
}
