'use client';

import type {
  IIngredient,
  MediaDeliveryGrant,
  MediaPreviewState,
} from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useEffect, useRef, useState } from 'react';

/** Readiness and expiry refresh share bounded, batched authenticated requests. */
export function useAuthorizedMediaPreview(
  ingredient: IIngredient | null,
  retryRevision = 0,
): MediaDeliveryGrant | null {
  const getService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );
  const { orgId, sessionId, userId } = useAuthIdentity();
  const [fresh, setFresh] = useState<MediaPreviewState | null>(null);
  const initial = ingredient?.mediaDelivery ?? null;
  const contextIdentity = [orgId, sessionId, userId].join('\u0001');
  const initialContext = useRef(contextIdentity);
  const hasSwitchedContext = useRef(false);
  if (initialContext.current !== contextIdentity)
    hasSwitchedContext.current = true;
  // Once identity changes, a retained store object cannot prove which scope
  // issued its initial capability. Reauthorize it, including switches back.
  const requireFreshAuthorization =
    hasSwitchedContext.current || retryRevision > 0;
  const sourceIdentity = [
    ingredient?.id,
    ingredient?.brandId,
    ingredient?.isDeleted,
    initial?.url,
    initial?.expiresAt,
    initial?.state,
    initial?.purpose,
    orgId,
    sessionId,
    userId,
    retryRevision,
  ].join('\u0001');
  const current =
    fresh?.sourceIdentity === sourceIdentity
      ? fresh.grant
      : requireFreshAuthorization && initial
        ? { ...initial, state: 'PENDING' as const, url: null, expiresAt: null }
        : initial;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setFresh(null);
    if (!ingredient?.id || ingredient.isDeleted || !initial)
      return () => controller.abort();
    const id = ingredient.id;
    const schedule = (grant: MediaDeliveryGrant | null) => {
      if (
        controller.signal.aborted ||
        !grant ||
        ['FAILED', 'UNSUPPORTED'].includes(grant.state)
      )
        return;
      const delay =
        grant.state === 'READY' && grant.expiresAt
          ? Math.max(1000, Date.parse(grant.expiresAt) - Date.now() - 30_000)
          : 3000;
      if (grant.state === 'READY' && !grant.expiresAt) return;
      timer = setTimeout(() => void refresh(), delay);
    };
    const refresh = async () => {
      if (controller.signal.aborted || ++attempts > 200) return;
      try {
        const grant =
          initial.purpose === 'public-share' || initial.purpose === 'public-og'
            ? await IngredientsService.publicGrant(
                id,
                initial.purpose,
                controller.signal,
              )
            : await (await getService()).previewGrant(id, controller.signal);
        if (controller.signal.aborted) return;
        if (grant && grant.id === id && grant.purpose === initial.purpose) {
          setFresh({ sourceIdentity, grant });
          schedule(grant);
        } else if (retryRevision > 0) {
          setFresh({
            sourceIdentity,
            grant: { ...initial, state: 'FAILED', url: null, expiresAt: null },
          });
        } else {
          timer = setTimeout(
            () => void refresh(),
            Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)),
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          if (retryRevision > 0)
            setFresh({
              sourceIdentity,
              grant: {
                ...initial,
                state: 'FAILED',
                url: null,
                expiresAt: null,
              },
            });
          else
            timer = setTimeout(
              () => void refresh(),
              Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)),
            );
        }
      }
    };
    if (requireFreshAuthorization || initial.state === 'PENDING')
      void refresh();
    else schedule(initial);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [
    getService,
    ingredient?.id,
    sourceIdentity,
    initial,
    requireFreshAuthorization,
    ingredient?.isDeleted,
    retryRevision,
  ]);
  return ingredient?.isDeleted ? null : current;
}
