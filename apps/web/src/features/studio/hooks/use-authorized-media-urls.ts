'use client';

import type {
  IIngredient,
  MediaDeliveryGrant,
} from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { viewerKeyPart } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQueries } from '@tanstack/react-query';

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
  const { orgId, userId } = useAuthIdentity();
  const getService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );
  const entries = Object.entries(ingredients);
  // One read per tracked ingredient. The grant the page already holds seeds
  // the read, which then repeats until the URL is issued or shortly before it
  // expires. A changed grant is a different read, so a stale answer is never
  // shown for it.
  const reads = useQueries({
    queries: entries.map(([, ingredient]) => {
      const initial = ingredient.mediaDelivery;
      const isTracked =
        Boolean(initial) &&
        !ingredient.isDeleted &&
        initial?.state !== 'UNSUPPORTED';
      return {
        enabled: isTracked && Boolean(userId),
        initialData: hasReadyUrl(initial) ? initial : undefined,
        initialDataUpdatedAt: () => Date.now(),
        queryFn: async ({
          signal,
        }: {
          signal: AbortSignal;
        }): Promise<MediaDeliveryGrant> => {
          const grant = await (await getService()).previewGrant(
            ingredient.id,
            signal,
          );
          if (
            !grant ||
            grant.id !== ingredient.id ||
            grant.purpose !== initial?.purpose
          ) {
            throw new Error('Media grant does not match the ingredient');
          }
          return grant;
        },
        queryKey: [
          'media-delivery-grant',
          ingredient.id,
          initial?.purpose,
          initial?.state,
          initial?.url,
          initial?.expiresAt,
          viewerKeyPart(userId, orgId),
        ],
        refetchInterval: (query: {
          state: {
            data: MediaDeliveryGrant | undefined;
            dataUpdateCount: number;
            errorUpdateCount: number;
          };
        }): number | false => {
          const {
            data: grant,
            dataUpdateCount,
            errorUpdateCount,
          } = query.state;
          if (dataUpdateCount + errorUpdateCount > MAX_ATTEMPTS) return false;
          if (grant?.state === 'UNSUPPORTED' || grant?.state === 'FAILED') {
            return false;
          }
          if (grant?.state === 'READY' && grant.url) {
            return grant.expiresAt
              ? Math.max(
                  1000,
                  Date.parse(grant.expiresAt) - Date.now() - REFRESH_MARGIN_MS,
                )
              : false;
          }
          return PENDING_POLL_MS;
        },
        refetchIntervalInBackground: true,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      };
    }),
  });

  const urls: Record<string, string | undefined> = {};
  entries.forEach(([key, ingredient], index) => {
    const grant = reads[index]?.data ?? ingredient.mediaDelivery;
    urls[key] = ingredient.isDeleted
      ? undefined
      : grant
        ? (grant.url ?? undefined)
        : ingredient.cdnUrl || ingredient.ingredientUrl || undefined;
  });
  return urls;
}
