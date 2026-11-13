import { MIN_DRAFT_CHARACTERS } from '@api/endpoints/onboarding/utils/onboarding-draft-brief.util';
import type {
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
} from '@genfeedai/contracts/interfaces';

/**
 * Properties for the server-side onboarding output events. Counts, statuses and
 * platform names only: draft text, brand copy and URLs never leave the API.
 */
export function buildScanFunnelProperties(
  result: IOnboardingScanResult,
): Record<string, unknown> {
  const summary = result.summary;
  return {
    audienceSuggestionCount: summary?.suggestions?.audiences.length ?? 0,
    competitorSuggestionCount: summary?.suggestions?.competitors.length ?? 0,
    hasDescription: Boolean(summary?.description),
    hasLogo: Boolean(summary?.logoUrl),
    hasTone: Boolean(summary?.tone),
    offerSuggestionCount: summary?.suggestions?.offers.length ?? 0,
    outcome: result.status,
    reason: result.reason ?? null,
  };
}

export function buildDraftsFunnelProperties(
  result: IOnboardingFirstDraftsResult | null,
  options: { hasContext: boolean; isRedo: boolean },
): Record<string, unknown> {
  const drafts = result?.drafts ?? [];
  return {
    campaignImageReadyCount:
      result?.campaignImages?.filter((image) => image.status === 'ready')
        .length ?? 0,
    draftCount: drafts.length,
    draftLengths: Object.fromEntries(
      drafts.map((draft) => [draft.platform, draft.text.length]),
    ),
    hasContext: options.hasContext,
    hasMasterImage: Boolean(result?.imageUrl),
    isRedo: options.isRedo,
    platforms: drafts.map((draft) => draft.platform),
    shortDraftCount: drafts.filter(
      (draft) => draft.text.length < MIN_DRAFT_CHARACTERS[draft.platform],
    ).length,
    status: result?.status ?? 'failed',
  };
}
