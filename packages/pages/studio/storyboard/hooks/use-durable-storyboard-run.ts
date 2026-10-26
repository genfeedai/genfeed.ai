'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getSession } from '@genfeedai/auth-client';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type {
  StoryboardARollQuote,
  StoryboardPresenterTrack,
} from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import { storyboardPlanSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { storyboardSourceSelectorSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import type { StoryboardStillQuote } from '@genfeedai/contracts/api-types/contracts/storyboard-still.contract';
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

/** How often a board with a generating still asks the server to record finished stills. */
const STILL_RECONCILE_MS = 4_000;
/** Presenter renders take minutes; the narration draft takes seconds. */
const PRESENTER_RECONCILE_MS = 8_000;
/** Cutaway stills are not marked on the plan; stop asking after this long. */
const CUTAWAY_STILL_WAIT_MS = 10 * 60_000;

function hasLiveChunks(run: StoryboardRun | null): boolean {
  return [run?.config.aRoll, run?.config.animatic].some((track) =>
    track?.chunks.some(
      (chunk) => chunk.state === 'pending' || chunk.state === 'submitted',
    ),
  );
}

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
                    : storyboardPlanSchema.safeParse(value.plan);
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
  /**
   * Drafts the plan from the saved brief, or revises it when `instruction` is
   * set. Callers flush pending plan and source edits first so the persisted
   * revision this reads is the one the draft is based on.
   */
  const draftPlan = useCallback(
    async (instruction?: string) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const persisted = latestRun.current;
      if (!persisted) throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      return adopt(
        await service.draftStoryboardPlan(brandId, runId, {
          expectedRevision: persisted.config.revision,
          ...(instruction ? { instruction } : {}),
        }),
      );
    },
    [brandId, runId, getService, adopt, scope],
  );
  const quoteStills = useCallback(
    async (revision: number, shotIds?: readonly string[]) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      try {
        return await service.quoteStoryboardStills(brandId, runId, {
          expectedRevision: revision,
          ...(shotIds ? { shotIds: [...shotIds] } : {}),
        });
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not price the stills.'),
        );
      }
    },
    [brandId, runId, getService, scope],
  );
  const generateStills = useCallback(
    async (quote: StoryboardStillQuote) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      let run: StoryboardRun;
      try {
        run = await service.generateStoryboardStills(brandId, runId, {
          expectedRevision: quote.revision,
          shotIds: quote.items.map((item) => item.shotId),
          inputHash: quote.inputHash,
        });
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not start the stills.'),
        );
      }
      return adopt(run);
    },
    [brandId, runId, getService, adopt, scope],
  );
  /** Long-form cutaways asked for a still, until the still is attached. */
  const [pendingCutaways, setPendingCutaways] = useState<{
    ids: readonly string[];
    since: number;
  }>();
  const quoteCutaways = useCallback(
    async (revision: number, cutawayIds?: readonly string[]) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      try {
        return await service.quoteStoryboardStills(brandId, runId, {
          expectedRevision: revision,
          ...(cutawayIds ? { cutawayIds: [...cutawayIds] } : {}),
        });
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not price the B-roll stills.'),
        );
      }
    },
    [brandId, runId, getService, scope],
  );
  const generateCutaways = useCallback(
    async (quote: StoryboardStillQuote) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      const cutawayIds = quote.items.map((item) => item.shotId);
      let run: StoryboardRun;
      try {
        run = await service.generateStoryboardStills(brandId, runId, {
          expectedRevision: quote.revision,
          cutawayIds,
          inputHash: quote.inputHash,
        });
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not start the B-roll stills.'),
        );
      }
      setPendingCutaways({ ids: cutawayIds, since: Date.now() });
      return adopt(run);
    },
    [brandId, runId, getService, adopt, scope],
  );
  const quotePresenter = useCallback(
    async (track: StoryboardPresenterTrack) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const persisted = latestRun.current;
      if (!persisted) throw new Error('Storyboard scope changed.');
      const service = await getService();
      try {
        return await service.quoteStoryboardPresenter(brandId, runId, track, {
          expectedRevision: persisted.config.revision,
        });
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not price the narration.'),
        );
      }
    },
    [brandId, runId, getService, scope],
  );
  const estimateLongForm = useCallback(
    async (revision: number, signal?: AbortSignal) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      try {
        return await service.estimateStoryboardLongForm(
          brandId,
          runId,
          { expectedRevision: revision },
          signal,
        );
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not price the whole video.'),
        );
      }
    },
    [brandId, runId, getService, scope],
  );
  const renderPresenter = useCallback(
    async (track: StoryboardPresenterTrack, quote: StoryboardARollQuote) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      let run: StoryboardRun;
      try {
        run = await service.renderStoryboardPresenter(brandId, runId, track, {
          expectedRevision: quote.revision,
          inputHash: quote.inputHash,
        });
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not start the narration.'),
        );
      }
      return adopt(run);
    },
    [brandId, runId, getService, adopt, scope],
  );
  /** Opens the animatic or the finished edit as an Editor project. */
  const assembleLongForm = useCallback(
    async (track: StoryboardPresenterTrack) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      try {
        return await service.assembleStoryboardLongForm(brandId, runId, track);
      } catch (error) {
        throw new Error(
          getJsonApiErrorMessage(error, 'Could not open the edit.'),
        );
      }
    },
    [brandId, runId, getService, scope],
  );
  const currentRun = result.scope === scope ? result.run : null;
  const isGeneratingStills = Boolean(
    currentRun?.config.plan?.shots.some(
      (shot) => shot.stillFreshness === 'generating',
    ),
  );
  useEffect(() => {
    if (!brandId || !isGeneratingStills) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      timer = setTimeout(() => {
        void getService()
          .then((service) =>
            service.reconcileStoryboardStills(
              brandId,
              runId,
              controller.signal,
            ),
          )
          .then((run) => {
            if (!controller.signal.aborted) adopt(run);
          })
          .catch(() => undefined)
          .finally(() => {
            if (!controller.signal.aborted) poll();
          });
      }, STILL_RECONCILE_MS);
    };
    poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [brandId, runId, isGeneratingStills, getService, adopt]);
  const isRenderingPresenter = hasLiveChunks(currentRun);
  useEffect(() => {
    if (!brandId || !isRenderingPresenter) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void getService()
        .then((service) =>
          service.reconcileStoryboardPresenter(
            brandId,
            runId,
            controller.signal,
          ),
        )
        .then((run) => {
          if (!controller.signal.aborted) adopt(run);
        })
        .catch(() => undefined);
    }, PRESENTER_RECONCILE_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [brandId, runId, isRenderingPresenter, getService, adopt]);
  const attachedCutaways = new Set(
    (currentRun?.config.plan?.longForm?.segments ?? []).flatMap((segment) =>
      segment.cutaways.flatMap((cutaway) =>
        cutaway.assetId ? [cutaway.id] : [],
      ),
    ),
  );
  const isDrawingCutaways = Boolean(
    pendingCutaways?.ids.some((id) => !attachedCutaways.has(id)),
  );
  useEffect(() => {
    if (!brandId || !isDrawingCutaways || !pendingCutaways) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (Date.now() - pendingCutaways.since > CUTAWAY_STILL_WAIT_MS) {
        setPendingCutaways(undefined);
        return;
      }
      void getService()
        .then((service) =>
          service.reconcileStoryboardStills(brandId, runId, controller.signal),
        )
        .then((run) => {
          if (!controller.signal.aborted) adopt(run);
        })
        .catch(() => undefined);
    }, STILL_RECONCILE_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [brandId, runId, isDrawingCutaways, pendingCutaways, getService, adopt]);
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
    draftPlan,
    quoteStills,
    generateStills,
    longForm: {
      isDrawingCutaways,
      quoteCutaways,
      generateCutaways,
      quotePresenter,
      renderPresenter,
      estimateLongForm,
      assembleLongForm,
    },
  };
}
