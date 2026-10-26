'use client';

import type {
  IIngredient,
  MediaDeliveryGrant,
} from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_ATTEMPTS = 40;
const PENDING_POLL_MS = 3000;
const REFRESH_MARGIN_MS = 30_000;

function hasReadyUrl(grant: MediaDeliveryGrant | undefined): boolean {
  return grant?.state === 'READY' && Boolean(grant.url);
}

/**
 * Preview URLs for a set of ingredients the page already holds, keyed like the
 * input. A grant that is not ready yet (a fresh render) or about to expire is
 * read again through the batched grant endpoint, so surfaces that show many
 * assets at once do not fall back to a raw CDN path that Cloud cannot read.
 */
export function useAuthorizedMediaUrls(
  ingredients: Readonly<Record<string, IIngredient>>,
): Record<string, string | undefined> {
  const getService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );
  const [fresh, setFresh] = useState<Record<string, MediaDeliveryGrant>>({});
  const ingredientsRef = useRef(ingredients);
  ingredientsRef.current = ingredients;
  const sourceKey = useMemo(
    () =>
      Object.entries(ingredients)
        .map(([key, ingredient]) =>
          [
            key,
            ingredient.id,
            ingredient.mediaDelivery?.state,
            ingredient.mediaDelivery?.url,
            ingredient.mediaDelivery?.expiresAt,
          ].join('\u0001'),
        )
        .sort()
        .join('\u0002'),
    [ingredients],
  );

  // sourceKey stands in for the ingredient set, so a new object each render
  // does not restart the grant reads.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by sourceKey
  useEffect(() => {
    const controller = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    setFresh({});

    const track = (key: string, id: string, initial: MediaDeliveryGrant) => {
      let attempts = 0;
      const schedule = (grant: MediaDeliveryGrant) => {
        if (controller.signal.aborted || grant.state === 'UNSUPPORTED') return;
        if (grant.state === 'FAILED') return;
        if (grant.state === 'READY' && !grant.expiresAt) return;
        const delay =
          grant.state === 'READY' && grant.expiresAt
            ? Math.max(
                1000,
                Date.parse(grant.expiresAt) - Date.now() - REFRESH_MARGIN_MS,
              )
            : PENDING_POLL_MS;
        const timer = setTimeout(() => {
          timers.delete(timer);
          void refresh();
        }, delay);
        timers.add(timer);
      };
      const refresh = async () => {
        if (controller.signal.aborted || ++attempts > MAX_ATTEMPTS) return;
        try {
          const grant = await (await getService()).previewGrant(
            id,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (grant && grant.id === id && grant.purpose === initial.purpose) {
            setFresh((current) => ({ ...current, [key]: grant }));
            schedule(grant);
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
        }
        schedule({ ...initial, state: 'PENDING', url: null, expiresAt: null });
      };
      if (hasReadyUrl(initial)) schedule(initial);
      else if (initial.state !== 'UNSUPPORTED') void refresh();
    };

    for (const [key, ingredient] of Object.entries(ingredientsRef.current)) {
      const initial = ingredient.mediaDelivery;
      if (!initial || ingredient.isDeleted) continue;
      track(key, ingredient.id, initial);
    }
    return () => {
      controller.abort();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [getService, sourceKey]);

  return useMemo(() => {
    const urls: Record<string, string | undefined> = {};
    for (const [key, ingredient] of Object.entries(ingredients)) {
      const grant = fresh[key] ?? ingredient.mediaDelivery;
      urls[key] = ingredient.isDeleted
        ? undefined
        : grant
          ? (grant.url ?? undefined)
          : ingredient.cdnUrl || ingredient.ingredientUrl || undefined;
    }
    return urls;
  }, [fresh, ingredients]);
}
