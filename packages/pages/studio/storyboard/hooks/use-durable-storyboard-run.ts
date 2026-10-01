'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getSession } from '@genfeedai/auth-client';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { storyboardImportedPlanSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { storyboardSourceSelectorSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { parseScopedAppPath } from '@genfeedai/contracts/constants';
import type {
  StoryboardDraftTransport,
  StoryboardEditablePlan,
} from '@genfeedai/props/studio/storyboard.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { eligibleStoryboardVoices } from '@pages/studio/storyboard/hooks/use-storyboard-voices';
import { requiresStoryboardTimingCapabilities } from '@pages/studio/storyboard/utils/storyboard-capabilities';
import { sessionActiveOrganizationId } from '@pages/studio/storyboard/utils/storyboard-session';
import { ContentRunsService } from '@services/content/content-runs.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Neutral persisted drafts use the brand-scoped API, never a local run substitute. */
export function useDurableStoryboardRun(runId: string) {
  const { brandId, organizationId } = useBrand();
  const { userId, orgId, sessionId } = useAuthIdentity();
  const { orgSlug } = useOrgUrl();
  const server = JSON.stringify([
    EnvironmentService.apiEndpoint,
    globalThis.__GENFEED_DESKTOP_ENV__?.authEndpoint,
  ]);
  const [transport, setTransport] = useState<StoryboardDraftTransport>();
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const getVoiceService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const scope = JSON.stringify([
    server,
    userId,
    orgId,
    organizationId,
    sessionId,
    brandId,
    runId,
  ]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [result, setResult] = useState<{
    scope: string;
    run: StoryboardRun | null;
    error: string | null;
    notFound: boolean;
  }>({ scope, run: null, error: null, notFound: false });
  const latestRun = useRef<StoryboardRun | null>(null);
  latestRun.current = result.scope === scope ? result.run : null;
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the explicit retry trigger.
  useEffect(() => {
    const controller = new AbortController();
    setResult({ scope, run: null, error: null, notFound: false });
    setTransport(undefined);
    if (brandId)
      void getService()
        .then(async (service) => {
          const run = await service.getStoryboardRun(
            brandId,
            runId,
            controller.signal,
          );
          if (run.organizationId !== organizationId)
            throw new Error('Storyboard organization changed.');
          if (!controller.signal.aborted && userId && organizationId) {
            const voiceService = await getVoiceService();
            if (controller.signal.aborted) return run;
            const capturedScope = {
              server,
              userId,
              organizationId,
              brandId,
              runId,
            };
            const canDispatch = async () => {
              if (
                JSON.stringify([
                  EnvironmentService.apiEndpoint,
                  globalThis.__GENFEED_DESKTOP_ENV__?.authEndpoint,
                ]) !== server
              )
                return false;
              // Route scope remains observable after this component detaches. A brand change in the same org is allowed.
              if (
                parseScopedAppPath(window.location.pathname)?.orgSlug !==
                orgSlug
              )
                return false;
              const session = await getSession();
              const currentOrg = sessionActiveOrganizationId(session);
              return (
                !session.error &&
                session.data?.user.id === userId &&
                (!currentOrg || currentOrg === capturedScope.organizationId)
              );
            };
            const adoptIfMounted = (saved: StoryboardRun) => {
              if (
                saved.id !== runId ||
                saved.brandId !== brandId ||
                saved.organizationId !== capturedScope.organizationId
              )
                throw new Error('Storyboard scope changed.');
              if (!controller.signal.aborted && activeScope.current === scope) {
                latestRun.current = saved;
                setResult((current) =>
                  current.scope === scope &&
                  (!current.run ||
                    saved.config.revision >= current.run.config.revision)
                    ? { scope, run: saved, error: null, notFound: false }
                    : current,
                );
              }
              return saved;
            };
            setTransport({
              scope: capturedScope,
              canDispatch,
              read: async () => {
                if (!(await canDispatch()))
                  throw new Error(
                    'Storyboard account or organization changed.',
                  );
                return adoptIfMounted(
                  await service.getStoryboardRun(brandId, runId),
                );
              },
              write: async (channel, revision, value) => {
                if (!(await canDispatch()))
                  throw new Error(
                    'Storyboard account or organization changed.',
                  );
                const parsed =
                  channel === 'source'
                    ? storyboardSourceSelectorSchema.safeParse(value.source)
                    : storyboardImportedPlanSchema.safeParse(value.plan);
                if (!parsed.success)
                  throw {
                    errors: [
                      {
                        status: '422',
                        detail:
                          parsed.error.issues[0]?.message ??
                          'Correct the draft before saving.',
                      },
                    ],
                  };
                if (channel === 'source')
                  return adoptIfMounted(
                    await service.updateStoryboardSource(brandId, runId, {
                      expectedRevision: revision,
                      source: value.source,
                    }),
                  );
                const selectedVoices = value.plan.cast.flatMap((member) =>
                  member.voiceId ? [member.voiceId] : [],
                );
                if (selectedVoices.length) {
                  const rows = await voiceService.findAllPages({
                    category: IngredientCategory.VOICE,
                    status: [
                      IngredientStatus.UPLOADED,
                      IngredientStatus.GENERATED,
                      IngredientStatus.VALIDATED,
                    ],
                    organizationId: capturedScope.organizationId,
                    isDeleted: false,
                  });
                  const eligible = eligibleStoryboardVoices(
                    rows,
                    capturedScope.organizationId,
                    brandId,
                  );
                  if (
                    selectedVoices.some(
                      (id) => !eligible.some((voice) => voice.id === id),
                    )
                  )
                    throw {
                      errors: [
                        {
                          status: '422',
                          detail:
                            'Replace or clear unavailable saved voices before saving.',
                        },
                      ],
                    };
                }
                const current = await service.getStoryboardRun(brandId, runId);
                if (current.config.revision !== revision)
                  throw {
                    errors: [
                      {
                        status: '409',
                        detail: 'Storyboard changed. Review the saved version.',
                      },
                    ],
                  };
                if (!current.config.plan)
                  throw {
                    errors: [
                      {
                        status: '422',
                        detail: 'Storyboard has no plan.',
                      },
                    ],
                  };
                const timing = requiresStoryboardTimingCapabilities(
                  current.config.plan,
                  value.plan,
                );
                const capabilities = timing
                  ? await service.getStoryboardRunCapabilities(brandId, runId)
                  : undefined;
                if (
                  capabilities &&
                  (capabilities.runId !== runId ||
                    capabilities.runRevision !== revision)
                )
                  throw {
                    errors: [
                      {
                        status: '409',
                        code: 'STORYBOARD_CAPABILITIES_CHANGED',
                        detail:
                          'Model capabilities changed. Review the saved version.',
                      },
                    ],
                  };
                if (!(await canDispatch()))
                  throw new Error(
                    'Storyboard account or organization changed.',
                  );
                return adoptIfMounted(
                  await service.updateStoryboardPlan(brandId, runId, {
                    expectedRevision: revision,
                    plan: value.plan,
                    ...(capabilities
                      ? { capabilityVersion: capabilities.capabilityVersion }
                      : {}),
                  }),
                );
              },
            });
          }
          return run;
        })
        .then((run) => {
          if (run.brandId !== brandId || run.id !== runId)
            throw new Error('Storyboard scope changed.');
          if (!controller.signal.aborted)
            setResult({ scope, run, error: null, notFound: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              scope,
              run: null,
              notFound: getJsonApiErrorMember(error)?.status === 404,
              error: getJsonApiErrorMessage(
                error,
                'Could not load storyboard.',
              ),
            });
        });
    return () => controller.abort();
  }, [
    brandId,
    organizationId,
    runId,
    scope,
    getService,
    getVoiceService,
    attempt,
    userId,
    orgSlug,
    server,
  ]);

  const adopt = useCallback(
    (run: StoryboardRun) => {
      if (
        activeScope.current !== scope ||
        run.brandId !== brandId ||
        run.id !== runId
      )
        throw new Error('Storyboard scope changed.');
      latestRun.current = run;
      setResult((current) =>
        current.scope === scope &&
        (!current.run || run.config.revision >= current.run.config.revision)
          ? { scope, run, error: null, notFound: false }
          : current,
      );
      return run;
    },
    [scope, brandId, runId],
  );
  const savePlan = useCallback(
    async (
      revision: number,
      plan: StoryboardEditablePlan,
      signal: AbortSignal,
      capabilityVersion?: string,
    ) => {
      if (!brandId || signal.aborted)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (signal.aborted) throw new Error('Storyboard scope changed.');
      const persisted = latestRun.current;
      if (
        activeScope.current !== scope ||
        persisted?.config.revision !== revision
      )
        throw new Error('Storyboard changed. Reload before saving.');
      if (!persisted.config.plan) throw new Error('Storyboard has no plan.');
      const timingChanged = requiresStoryboardTimingCapabilities(
        persisted.config.plan,
        plan,
      );
      if (timingChanged && !capabilityVersion)
        throw new Error(
          'Reload model capabilities before saving timing changes.',
        );
      const run = await service.updateStoryboardPlan(brandId, runId, {
        expectedRevision: revision,
        plan,
        ...(timingChanged ? { capabilityVersion } : {}),
      });
      if (signal.aborted) throw new Error('Storyboard scope changed.');
      return adopt(run);
    },
    [brandId, runId, getService, adopt, scope],
  );
  const saveSource = useCallback(
    async (revision: number, source: StoryboardSourceSelector) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      return adopt(
        await service.updateStoryboardSource(brandId, runId, {
          expectedRevision: revision,
          source,
        }),
      );
    },
    [brandId, scope, getService, runId, adopt],
  );
  const resetPlan = useCallback(
    async (revision: number) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      return adopt(
        await service.resetStoryboardPlan(brandId, runId, {
          expectedRevision: revision,
        }),
      );
    },
    [brandId, runId, getService, adopt, scope],
  );
  const approvePlan = useCallback(
    async (revision: number) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      return adopt(
        await service.approveStoryboardPlan(brandId, runId, {
          expectedRevision: revision,
        }),
      );
    },
    [brandId, runId, getService, adopt, scope],
  );
  return {
    transport,
    reread: transport?.read,
    run: result.scope === scope ? result.run : null,
    error: result.scope === scope ? result.error : null,
    notFound: result.scope === scope && result.notFound,
    refresh: () => setAttempt((value) => value + 1),
    savePlan,
    saveSource,
    resetPlan,
    approvePlan,
  };
}
