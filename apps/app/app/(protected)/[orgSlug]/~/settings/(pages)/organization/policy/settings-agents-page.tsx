import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentAutonomyMode,
  normalizeAgentAutonomyMode,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentModelAccess } from '@hooks/data/billing/use-agent-model-access/use-agent-model-access';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type {
  AgentPolicyState,
  OverrideCategoryModels,
  PolicyFormAction,
  PolicyFormState,
} from '@props/settings/policy.props';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Skeleton } from '@ui/primitives/skeleton';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import AdvancedRoutingCard from './advanced-routing-card';
import AgentPolicyCard from './agent-policy-card';
import CreditGovernanceCard from './credit-governance-card';
import {
  AGENT_GENERATION_MODEL_CATEGORIES,
  AGENT_REVIEW_MODEL_CATEGORIES,
  AGENT_THINKING_MODEL_CATEGORIES,
  getUnresolvedOverrideKey,
  resolveEnabledModelOptions,
  resolveEnabledModelsForCategory,
  resolveStoredAgentModelKey,
} from './resolve-enabled-model-options';

type OverrideField =
  | 'generationModelOverride'
  | 'reviewModelOverride'
  | 'thinkingModelOverride';

const EMPTY_CATALOG_MODELS: IModel[] = [];

const QUALITY_TIER_OPTIONS: Array<{
  description: string;
  label: string;
  value: NonNullable<AgentPolicyState['qualityTierDefault']>;
}> = [
  {
    description: 'Lower credit usage and lighter model routing.',
    label: 'Budget',
    value: 'budget',
  },
  {
    description: 'Default routing for most teams.',
    label: 'Balanced',
    value: 'balanced',
  },
  {
    description: 'Bias toward quality-first execution.',
    label: 'High Quality',
    value: 'high_quality',
  },
];

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const initialPolicyFormState: PolicyFormState = {
  agentDailyCreditCap: '',
  allowAdvancedOverrides: false,
  autonomyDefault: AgentAutonomyMode.SUPERVISED,
  brandDailyCreditCap: '',
  generationModelOverride: '',
  isSaving: false,
  qualityTierDefault: 'balanced',
  reviewModelOverride: '',
  thinkingModelOverride: '',
};

function policyFormReducer(
  state: PolicyFormState,
  action: PolicyFormAction,
): PolicyFormState {
  switch (action.type) {
    case 'INIT_FROM_SETTINGS':
      return { ...state, ...action.payload };
    case 'MERGE':
      return { ...state, ...action.payload };
    case 'SET_IS_SAVING':
      return { ...state, isSaving: action.payload };
    default:
      return state;
  }
}

/**
 * Resolves one override field's value for the save payload.
 *
 * `agentPolicy` is a JSON column the API replaces wholesale on every patch
 * (there is no server-side merge of nested JSON) — so every save must send
 * a complete, correct value for all three override fields, not just the one
 * the admin may have touched. That means an untouched field can never be
 * derived by re-validating against a catalog that may not have loaded yet,
 * or may no longer list a model the org previously chose: either would
 * silently erase a stored override on a save that has nothing to do with it.
 *
 * - `wasExplicitlyChanged`: the picker itself only ever emits `''`
 *   (Auto/clear) or an already-scoped, already-resolved catalog key, so an
 *   explicit change or clear is trusted directly.
 * - Catalog not loaded (pending or failed) and untouched: nothing to
 *   validate against yet — preserve the stored value verbatim.
 * - Catalog loaded and untouched: canonicalize a matching id to its key; a
 *   value that no longer matches (removed from the enabled list, a stale
 *   CUID) is kept as-is rather than cleared. The admin corrects or clears it
 *   explicitly through the picker — see {@link getUnresolvedOverrideKey} for
 *   how that state is surfaced there.
 */
function resolveOverrideForSave(
  raw: string,
  models: Array<Pick<IModel, 'id' | 'key'>>,
  isCatalogLoaded: boolean,
  wasExplicitlyChanged: boolean,
): string | null {
  const trimmed = raw.trim();
  if (wasExplicitlyChanged || !isCatalogLoaded) {
    return trimmed || null;
  }
  return resolveStoredAgentModelKey(trimmed, models) || trimmed || null;
}

function buildAgentPolicyPayload(
  form: PolicyFormState,
  categoryModels: OverrideCategoryModels,
  isCatalogLoaded: boolean,
  changedFields: ReadonlySet<keyof PolicyFormState>,
): AgentPolicyState {
  const overrides: Pick<AgentPolicyState, OverrideField> = {};

  if (!form.allowAdvancedOverrides) {
    overrides.generationModelOverride = null;
    overrides.reviewModelOverride = null;
    overrides.thinkingModelOverride = null;
  } else {
    overrides.generationModelOverride = resolveOverrideForSave(
      form.generationModelOverride,
      categoryModels.generation,
      isCatalogLoaded,
      changedFields.has('generationModelOverride'),
    );
    overrides.reviewModelOverride = resolveOverrideForSave(
      form.reviewModelOverride,
      categoryModels.review,
      isCatalogLoaded,
      changedFields.has('reviewModelOverride'),
    );
    overrides.thinkingModelOverride = resolveOverrideForSave(
      form.thinkingModelOverride,
      categoryModels.thinking,
      isCatalogLoaded,
      changedFields.has('thinkingModelOverride'),
    );
  }

  return {
    allowAdvancedOverrides: form.allowAdvancedOverrides,
    autonomyDefault: form.autonomyDefault,
    creditGovernance: {
      agentDailyCreditCap: toNumberOrNull(form.agentDailyCreditCap),
      brandDailyCreditCap: toNumberOrNull(form.brandDailyCreditCap),
      useOrganizationPool: true,
    },
    qualityTierDefault: form.qualityTierDefault,
    ...overrides,
  };
}

/** Loading placeholder for a card whose fields are not yet safe to render or edit. */
function SettingsCardSkeleton() {
  return (
    <Card bodyClassName="gap-3 p-4">
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </Card>
  );
}

export default function SettingsAgentsPage() {
  const { organizationId } = useBrand();
  const { isLoading: isSettingsLoading, refresh, settings } = useOrganization();
  const [state, dispatch] = useReducer(
    policyFormReducer,
    initialPolicyFormState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const creditSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Flips true only once INIT_FROM_SETTINGS has actually run against loaded
  // settings. Saving before that would build a payload from
  // initialPolicyFormState's empty defaults — see persistPolicy's guard.
  const hasInitializedRef = useRef(false);
  // Serializes saves so a slower earlier PATCH can never land after (and
  // overwrite) a faster later one — see enqueuePersist.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const {
    agentDailyCreditCap,
    allowAdvancedOverrides,
    autonomyDefault,
    brandDailyCreditCap,
    generationModelOverride,
    isSaving,
    qualityTierDefault,
    reviewModelOverride,
    thinkingModelOverride,
  } = state;

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  const { modelAccess, modelCosts } = useAgentModelAccess();

  const {
    data: catalogModels = EMPTY_CATALOG_MODELS,
    isPending: isCatalogPending,
    isSuccess: isCatalogLoaded,
  } = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<IModel[]> => {
      const service = await getModelsService();
      return service.findAllPages({});
    },
    queryKey: ['settings-agent-model-catalog', organizationId],
  });

  useEffect(() => {
    // Wait for the real settings — initialPolicyFormState's empty defaults
    // (allowAdvancedOverrides: false, blank caps) are a placeholder, never a
    // value to initialize the form from. Dispatching them here would let an
    // early control change persist a blank policy over whatever is stored.
    if (isSettingsLoading) {
      return;
    }
    const agentPolicy = settings?.agentPolicy;
    dispatch({
      payload: {
        agentDailyCreditCap:
          agentPolicy?.creditGovernance?.agentDailyCreditCap?.toString() ?? '',
        allowAdvancedOverrides: agentPolicy?.allowAdvancedOverrides ?? false,
        autonomyDefault: normalizeAgentAutonomyMode(
          agentPolicy?.autonomyDefault,
        ),
        brandDailyCreditCap:
          agentPolicy?.creditGovernance?.brandDailyCreditCap?.toString() ?? '',
        generationModelOverride: agentPolicy?.generationModelOverride ?? '',
        isSaving: false,
        qualityTierDefault: agentPolicy?.qualityTierDefault ?? 'balanced',
        reviewModelOverride: agentPolicy?.reviewModelOverride ?? '',
        thinkingModelOverride: agentPolicy?.thinkingModelOverride ?? '',
      },
      type: 'INIT_FROM_SETTINGS',
    });
    hasInitializedRef.current = true;
  }, [isSettingsLoading, settings?.agentPolicy]);

  useEffect(() => {
    return () => {
      if (creditSaveTimeoutRef.current) {
        clearTimeout(creditSaveTimeoutRef.current);
      }
    };
  }, []);

  const enabledModelIds = settings?.enabledModelIds ?? [];
  const thinkingCategoryModels = useMemo(
    () =>
      resolveEnabledModelsForCategory(
        enabledModelIds,
        catalogModels,
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const generationCategoryModels = useMemo(
    () =>
      resolveEnabledModelsForCategory(
        enabledModelIds,
        catalogModels,
        AGENT_GENERATION_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const reviewCategoryModels = useMemo(
    () =>
      resolveEnabledModelsForCategory(
        enabledModelIds,
        catalogModels,
        AGENT_REVIEW_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const categoryModels = useMemo<OverrideCategoryModels>(
    () => ({
      generation: generationCategoryModels,
      review: reviewCategoryModels,
      thinking: thinkingCategoryModels,
    }),
    [generationCategoryModels, reviewCategoryModels, thinkingCategoryModels],
  );

  const persistPolicy = useCallback(
    async (
      next: PolicyFormState,
      changedFields: ReadonlySet<keyof PolicyFormState>,
    ) => {
      // Belt-and-suspenders: the controls that call this are gated (disabled
      // and skeletoned) until settings load, but this is the one place that
      // actually sends a PATCH, so it refuses on its own too rather than
      // trusting the UI gate alone.
      if (!organizationId || !hasInitializedRef.current) {
        return;
      }

      dispatch({ payload: true, type: 'SET_IS_SAVING' });
      try {
        const service = await getOrganizationsService();
        await service.patchSettings(organizationId, {
          agentPolicy: buildAgentPolicyPayload(
            next,
            categoryModels,
            isCatalogLoaded,
            changedFields,
          ),
        });
        await refresh();
      } catch (error) {
        logger.error('Failed to update agent policy settings', error);
      } finally {
        dispatch({ payload: false, type: 'SET_IS_SAVING' });
      }
    },
    [
      categoryModels,
      getOrganizationsService,
      isCatalogLoaded,
      organizationId,
      refresh,
    ],
  );

  /**
   * Runs saves strictly one after another. Two quick edits are two separate
   * PATCHes; without this, their responses can arrive out of order and the
   * slower, earlier request would land last and overwrite the newer change.
   * Queuing (rather than de-duping) guarantees whichever save was enqueued
   * last also *completes* last, so it always wins — matching
   * useAgentModePersistence's queue for the same race.
   */
  const enqueuePersist = useCallback(
    (
      next: PolicyFormState,
      changedFields: ReadonlySet<keyof PolicyFormState>,
    ) => {
      const run = () => persistPolicy(next, changedFields);
      const queued = saveQueueRef.current.then(run, run);
      saveQueueRef.current = queued;
      return queued;
    },
    [persistPolicy],
  );

  const updateAndPersist = useCallback(
    (patch: Partial<PolicyFormState>) => {
      if (!hasInitializedRef.current) {
        return;
      }
      const next = { ...stateRef.current, ...patch, isSaving: false };
      dispatch({ payload: next, type: 'MERGE' });
      void enqueuePersist(
        next,
        new Set(Object.keys(patch) as Array<keyof PolicyFormState>),
      );
    },
    [enqueuePersist],
  );

  const updateCreditField = useCallback(
    (patch: Partial<PolicyFormState>) => {
      if (!hasInitializedRef.current) {
        return;
      }
      const next = { ...stateRef.current, ...patch, isSaving: false };
      dispatch({ payload: next, type: 'MERGE' });

      if (creditSaveTimeoutRef.current) {
        clearTimeout(creditSaveTimeoutRef.current);
      }
      const changedFields = new Set(
        Object.keys(patch) as Array<keyof PolicyFormState>,
      );
      // Debounce number fields so mid-typing does not spam PATCH.
      creditSaveTimeoutRef.current = setTimeout(() => {
        void enqueuePersist(
          { ...stateRef.current, ...patch, isSaving: false },
          changedFields,
        );
      }, 400);
    },
    [enqueuePersist],
  );

  const thinkingModelOptions = useMemo(
    () =>
      resolveEnabledModelOptions(
        enabledModelIds,
        catalogModels,
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const generationModelOptions = useMemo(
    () =>
      resolveEnabledModelOptions(
        enabledModelIds,
        catalogModels,
        AGENT_GENERATION_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const reviewModelOptions = useMemo(
    () =>
      resolveEnabledModelOptions(
        enabledModelIds,
        catalogModels,
        AGENT_REVIEW_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );

  // Meaningful once the catalog has settled either way — loaded (a stored
  // value that no longer matches an enabled model) or failed (nothing to
  // validate against, maybe permanently). While it is still pending, "no
  // match" only means nothing has arrived to match against yet — that is a
  // loading state, not an unresolved override (see isModelCatalogLoading
  // below, which gates the picker itself while pending).
  const generationOverrideUnresolvedKey = useMemo(
    () =>
      isCatalogPending
        ? null
        : getUnresolvedOverrideKey(
            generationModelOverride,
            generationCategoryModels,
          ),
    [generationCategoryModels, generationModelOverride, isCatalogPending],
  );
  const reviewOverrideUnresolvedKey = useMemo(
    () =>
      isCatalogPending
        ? null
        : getUnresolvedOverrideKey(reviewModelOverride, reviewCategoryModels),
    [isCatalogPending, reviewCategoryModels, reviewModelOverride],
  );
  const thinkingOverrideUnresolvedKey = useMemo(
    () =>
      isCatalogPending
        ? null
        : getUnresolvedOverrideKey(
            thinkingModelOverride,
            thinkingCategoryModels,
          ),
    [isCatalogPending, thinkingCategoryModels, thinkingModelOverride],
  );

  if (isSettingsLoading) {
    return (
      <div className="space-y-4">
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AgentPolicyCard
        autonomyDefault={autonomyDefault}
        isSaving={isSaving}
        onAutonomyDefaultChange={(value) =>
          updateAndPersist({ autonomyDefault: value })
        }
        onQualityTierDefaultChange={(value) =>
          updateAndPersist({ qualityTierDefault: value })
        }
        qualityTierDefault={qualityTierDefault}
        qualityTierOptions={QUALITY_TIER_OPTIONS}
      />

      <CreditGovernanceCard
        agentDailyCreditCap={agentDailyCreditCap}
        brandDailyCreditCap={brandDailyCreditCap}
        onAgentDailyCreditCapChange={(value) =>
          updateCreditField({ agentDailyCreditCap: value })
        }
        onBrandDailyCreditCapChange={(value) =>
          updateCreditField({ brandDailyCreditCap: value })
        }
      />

      <AdvancedRoutingCard
        agentModelAccess={modelAccess}
        allowAdvancedOverrides={allowAdvancedOverrides}
        generationModelOptions={generationModelOptions}
        generationModelOverride={resolveStoredAgentModelKey(
          generationModelOverride,
          generationCategoryModels,
        )}
        generationModelOverrideUnresolvedKey={generationOverrideUnresolvedKey}
        isModelCatalogLoading={isCatalogPending}
        modelCostEstimates={modelCosts}
        isSaving={isSaving}
        onAllowAdvancedOverridesChange={(value) =>
          updateAndPersist({ allowAdvancedOverrides: value })
        }
        onGenerationModelOverrideChange={(value) =>
          updateAndPersist({ generationModelOverride: value })
        }
        onReviewModelOverrideChange={(value) =>
          updateAndPersist({ reviewModelOverride: value })
        }
        onThinkingModelOverrideChange={(value) =>
          updateAndPersist({ thinkingModelOverride: value })
        }
        reviewModelOptions={reviewModelOptions}
        reviewModelOverride={resolveStoredAgentModelKey(
          reviewModelOverride,
          reviewCategoryModels,
        )}
        reviewModelOverrideUnresolvedKey={reviewOverrideUnresolvedKey}
        thinkingModelOptions={thinkingModelOptions}
        thinkingModelOverride={resolveStoredAgentModelKey(
          thinkingModelOverride,
          thinkingCategoryModels,
        )}
        thinkingModelOverrideUnresolvedKey={thinkingOverrideUnresolvedKey}
      />
    </div>
  );
}
