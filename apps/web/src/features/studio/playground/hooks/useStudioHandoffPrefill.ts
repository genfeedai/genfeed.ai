'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStudioPlaygroundHandoff } from '@/features/studio/playground/hooks/useStudioPlaygroundHandoff';
import { toContentReference } from '@/features/studio/playground/utils/studio-content-references';
import {
  buildStudioSettingsPatchFromHandoff,
  resolveHandoffIdentityNotice,
  resolveHandoffModelKey,
  resolveHandoffSettingsOverrides,
  studioHandoffReferenceRole,
} from '@/features/studio/playground/utils/studio-playground-handoff';
import { getStudioPlaygroundTypeConfig } from '@/features/studio/playground/utils/studio-playground-types';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioHandoffPrefillParams
  extends Pick<
    StudioWorkspaceScope,
    | 'applyTypeSettings'
    | 'brandId'
    | 'getIngredientsService'
    | 'isLoadingModels'
    | 'isMountedRef'
    | 'models'
    | 'notificationsService'
    | 'organizationId'
    | 'setContentReferences'
    | 'setPrompt'
    | 'type'
    | 'updateSettings'
  > {
  isHydrated: boolean;
  setRecognizedSkillSlugs: Dispatch<SetStateAction<string[]>>;
}

/**
 * #4670 Open in Studio: a resolved Agent handoff pre-fills the composer. The
 * hook applies the prompt and settings once, fetches the handoff's references
 * and validates its model against the organization's catalog.
 */
export function useStudioHandoffPrefill({
  applyTypeSettings,
  brandId,
  getIngredientsService,
  isHydrated,
  isLoadingModels,
  isMountedRef,
  models,
  notificationsService,
  organizationId,
  setContentReferences,
  setPrompt,
  setRecognizedSkillSlugs,
  type,
  updateSettings,
}: UseStudioHandoffPrefillParams) {
  // #4670 Open in Studio: a resolved Agent handoff pre-fills the composer.
  // Precedence over remembered local settings comes for free from
  // `applyTypeSettings` — it marks every patched field `'user'`-owned in the
  // shared setup store, exactly like an operator editing the popover
  // themselves would.
  const { isLoading: isHandoffLoading, payload: handoffPayload } =
    useStudioPlaygroundHandoff();
  const appliedHandoffRef = useRef(false);
  const handoffScope = useMemo(
    () => ({ brandId, getIngredientsService, handoffPayload, organizationId }),
    [brandId, getIngredientsService, handoffPayload, organizationId],
  );
  const [acceptedHandoffScope, setAcceptedHandoffScope] = useState<
    typeof handoffScope | null
  >(null);
  const isHandoffAccepted = acceptedHandoffScope === handoffScope;
  const handoffScopeRef = useRef(handoffScope);
  const handoffReferencesControllerRef = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    if (handoffScopeRef.current !== handoffScope) {
      handoffReferencesControllerRef.current?.abort();
      handoffScopeRef.current = handoffScope;
    }
  }, [handoffScope]);
  useEffect(() => {
    // Wait for the active brand to resolve before deciding anything — an
    // empty `brandId` on the first render is a hydration race, never a real
    // mismatch, and must not permanently reject a valid handoff.
    if (
      !isHydrated ||
      !handoffPayload ||
      !brandId ||
      appliedHandoffRef.current
    ) {
      return;
    }
    appliedHandoffRef.current = true;

    // #4716 review P2: the handoff's server-side scope is org/user only —
    // it carries no brand check. A handoff created under a different brand
    // must never silently prefill this brand's composer with another
    // brand's prompt, settings, or references.
    if (handoffPayload.brandId !== brandId) {
      notificationsService.info(
        'That Studio handoff has expired or was already used. Continuing with your usual defaults.',
      );
      return;
    }
    setAcceptedHandoffScope(handoffScope);

    const handoffSlugs = handoffPayload.requestedSkillSlugs ?? [];
    setRecognizedSkillSlugs((previous) => [
      ...new Set([...previous, ...handoffSlugs]),
    ]);
    setPrompt(
      [...handoffSlugs.map((slug) => `/${slug}`), handoffPayload.prompt].join(
        ' ',
      ),
    );
    applyTypeSettings(
      handoffPayload.type,
      buildStudioSettingsPatchFromHandoff(handoffPayload),
    );

    const identityNotice = resolveHandoffIdentityNotice(handoffPayload);
    if (identityNotice) {
      notificationsService.info(identityNotice);
    }
  }, [
    applyTypeSettings,
    brandId,
    handoffPayload,
    handoffScope,
    isHydrated,
    notificationsService,
    setPrompt,
    setRecognizedSkillSlugs,
  ]);

  // Keep the one-request latch across Strict Mode's synthetic remount.
  // Scope changes permanently invalidate the pending result, without retrying
  // a handoff that has already been consumed.
  const handoffReferencesRequestedRef = useRef(false);
  useEffect(() => {
    if (
      !isHandoffAccepted ||
      !handoffPayload ||
      handoffReferencesRequestedRef.current
    ) {
      return;
    }
    const referenceIds = handoffPayload.references ?? [];
    if (referenceIds.length === 0) {
      return;
    }
    handoffReferencesRequestedRef.current = true;

    const role = studioHandoffReferenceRole(handoffPayload.type);
    const controller = new AbortController();
    handoffReferencesControllerRef.current = controller;
    const isScopeCurrent = () =>
      isMountedRef.current &&
      !controller.signal.aborted &&
      handoffScopeRef.current === handoffScope;
    void (async () => {
      try {
        const service = await getIngredientsService();
        if (!isScopeCurrent()) {
          return;
        }
        const assets = await service.findByIds(referenceIds);
        const newReferences = assets.flatMap(
          (asset) => toContentReference(asset, role) ?? [],
        );
        if (!isScopeCurrent() || newReferences.length === 0) {
          return;
        }
        setContentReferences((current) => [...current, ...newReferences]);
      } catch {
        // Best-effort: references the Agent resolved moments ago may already
        // be gone by the time Studio opens. Skip them rather than blocking
        // the rest of the prefill.
      }
    })();
  }, [
    getIngredientsService,
    handoffPayload,
    handoffScope,
    isHandoffAccepted,
    setContentReferences,
    isMountedRef.current,
  ]);

  // #4716 review P1: the Agent resolves a concrete model at handoff time, but
  // the org's enabled-model allowlist can differ from what the Agent saw (or
  // change before Studio opens). Validate once the catalog for the handoff's
  // own type has finished loading and fall back to Studio's own Auto default
  // with a notice, rather than repeating `resolveModelKey`'s silent
  // `models[0]` substitution one step earlier and just as silently.
  const handoffModelValidatedRef = useRef(false);
  useEffect(() => {
    if (
      !handoffPayload ||
      !isHandoffAccepted ||
      handoffModelValidatedRef.current ||
      type !== handoffPayload.type ||
      isLoadingModels
    ) {
      return;
    }
    handoffModelValidatedRef.current = true;

    if (!getStudioPlaygroundTypeConfig(type).capabilities.hasModelSelection) {
      return;
    }

    const { isFallback, modelKey } = resolveHandoffModelKey(
      handoffPayload.modelKey,
      models,
    );
    if (isFallback) {
      updateSettings({ modelKey });
    }

    // #4716 review FR9: validate the handoff's other params (aspectRatio,
    // duration, outputs, resolution) against what the *resolved* model
    // supports — using the just-corrected model when the pick itself fell
    // back, so resolution options are checked against the model settings
    // will actually carry, not a since-rejected one.
    const { droppedFields, patch } = resolveHandoffSettingsOverrides(
      handoffPayload,
      modelKey,
      models,
    );
    if (Object.keys(patch).length > 0) {
      updateSettings(patch);
    }

    const notices: string[] = [];
    if (isFallback) {
      notices.push(
        "The Agent's model pick for this generation isn't available for your organization — using Studio's default instead.",
      );
    }
    if (droppedFields.length > 0) {
      notices.push(
        `Some settings from the Agent (${droppedFields.join(', ')}) aren't supported here — Studio's defaults were used instead.`,
      );
    }
    if (notices.length > 0) {
      notificationsService.info(notices.join(' '));
    }
  }, [
    handoffPayload,
    isHandoffAccepted,
    isLoadingModels,
    models,
    notificationsService,
    type,
    updateSettings,
  ]);
  return { handoffPayload, isHandoffAccepted, isHandoffLoading };
}
