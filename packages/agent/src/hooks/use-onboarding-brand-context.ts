import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { buildOnboardingBrandContextPanel } from '@genfeedai/agent/utils/onboarding-brand-context.util';
import type { IBrandInterviewCompleteness } from '@genfeedai/contracts/interfaces';
import type { OnboardingBrandContextPanel } from '@genfeedai/props/ui/agent/agent-onboarding.props';
import { useEffect, useMemo, useState } from 'react';

interface UseOnboardingBrandContextParams {
  apiService: AgentApiService;
  brandId: string | null | undefined;
  isEnabled: boolean;
  /** Changes whenever a turn may have saved an answer, to refetch the score. */
  refreshKey: string;
}

/**
 * Live brand-context score and onboarding card progress for the onboarding
 * side panel. Refetches after every turn change; a failed refresh keeps the
 * last good value instead of blanking the panel.
 */
export function useOnboardingBrandContext({
  apiService,
  brandId,
  isEnabled,
  refreshKey,
}: UseOnboardingBrandContextParams): OnboardingBrandContextPanel | null {
  const [completeness, setCompleteness] = useState<{
    brandId: string;
    value: IBrandInterviewCompleteness;
  } | null>(null);

  useEffect(() => {
    if (!isEnabled || !brandId || !refreshKey) {
      return;
    }
    const controller = new AbortController();
    apiService
      .getBrandCompleteness(brandId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setCompleteness({ brandId, value });
      })
      .catch(() => {
        // Keep the last known score; the next turn refetches.
      });
    return () => controller.abort();
  }, [apiService, brandId, isEnabled, refreshKey]);

  return useMemo(() => {
    if (!isEnabled || !brandId) return null;
    const current = completeness?.brandId === brandId ? completeness : null;
    return buildOnboardingBrandContextPanel(
      current?.value.overallScore ?? null,
      current?.value.onboardingAnswers ?? null,
    );
  }, [brandId, completeness, isEnabled]);
}
