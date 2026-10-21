'use client';

import { PostCategory } from '@genfeedai/contracts';
import type {
  FirstDraftsScheduleProps,
  ScheduleRow,
} from '@genfeedai/props/onboarding/first-drafts.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { usePlatformOAuthConnect } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { PostsService } from '@services/content/posts.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { useCallback, useEffect, useMemo, useState } from 'react';

const SCHEDULE_RETURN_PATH = '/onboarding/brand?step=schedule';
const FIRST_POST_HOUR = 9;
const HOURS_BETWEEN_POSTS = 3;

/** TikTok posts are videos that render after approval, so they are not scheduled here. */
const UNSUPPORTED_PLATFORMS = new Set(['tiktok']);

/** Tomorrow morning, then one post every few hours so the channels do not collide. */
function slotFor(index: number): string {
  const slot = new Date();
  slot.setDate(slot.getDate() + 1);
  slot.setHours(FIRST_POST_HOUR + index * HOURS_BETWEEN_POSTS, 0, 0, 0);
  return slot.toISOString();
}

interface ScheduleStepState {
  connect: (platform: string) => void;
  error: 'connect' | 'schedule' | null;
  isLoading: boolean;
  isScheduling: boolean;
  rows: ScheduleRow[];
  schedule: () => void;
}

/**
 * Which liked drafts can go out now (an account is connected), which need a
 * connection first, and the one action that schedules every ready draft.
 */
export function useScheduleStep({
  brandId,
  imageIngredientId,
  likedDrafts,
}: Pick<
  FirstDraftsScheduleProps,
  'brandId' | 'imageIngredientId' | 'likedDrafts'
>): ScheduleStepState {
  const { getToken } = useAuthIdentity();
  const connectPlatform = usePlatformOAuthConnect({
    brandId,
    returnTo: SCHEDULE_RETURN_PATH,
  });
  const [credentialByPlatform, setCredentialByPlatform] = useState<
    Record<string, string>
  >({});
  const [outcomes, setOutcomes] = useState<
    Record<string, 'scheduled' | 'failed'>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<ScheduleStepState['error']>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) throw new Error('Not authenticated');
        const readiness = await CredentialsService.getInstance(
          token,
        ).listBrandPublishingReadiness(brandId, controller.signal);
        if (controller.signal.aborted) return;
        setCredentialByPlatform(
          Object.fromEntries(
            readiness
              .filter((item) => item.credentialId && item.canSchedule)
              .map((item) => [
                String(item.providerKey).toLowerCase(),
                item.credentialId as string,
              ]),
          ),
        );
      } catch (caught) {
        if (controller.signal.aborted) return;
        // Unknown readiness reads as "not connected", which offers a connect.
        logger.error('Failed to read publishing readiness', caught);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [brandId, getToken]);

  const rows = useMemo<ScheduleRow[]>(() => {
    let index = 0;
    return likedDrafts.map((draft) => {
      const credentialId = credentialByPlatform[draft.platform] ?? null;
      // Instagram cannot post without its image.
      const isSupported =
        !UNSUPPORTED_PLATFORMS.has(draft.platform) &&
        (draft.platform !== 'instagram' || imageIngredientId !== null);
      const scheduledAt = isSupported ? slotFor(index++) : '';
      const outcome = outcomes[draft.postId];
      return {
        credentialId,
        draft,
        scheduledAt,
        state: !isSupported
          ? 'unsupported'
          : (outcome ?? (credentialId ? 'ready' : 'connect')),
      };
    });
  }, [credentialByPlatform, imageIngredientId, likedDrafts, outcomes]);

  const connect = useCallback(
    (platform: string) => {
      setError(null);
      connectPlatform(platform).catch((caught: unknown) => {
        logger.error('Failed to start the account connect', caught);
        setError('connect');
      });
    },
    [connectPlatform],
  );

  const schedule = useCallback(() => {
    if (isScheduling) return;
    setIsScheduling(true);
    setError(null);
    void (async () => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) throw new Error('Not authenticated');
        const posts = PostsService.getInstance(token);
        const releases = ReleaseGroupsService.getInstance(token);
        for (const row of rows) {
          // A failed row is retried; a scheduled or unconnected one is left alone.
          if (
            (row.state !== 'ready' && row.state !== 'failed') ||
            !row.credentialId
          )
            continue;
          try {
            await posts.patch(row.draft.postId, {
              credentialId: row.credentialId,
              ...(imageIngredientId
                ? {
                    category: PostCategory.IMAGE,
                    ingredients: [imageIngredientId],
                  }
                : {}),
            });
            const group = await releases.ensureFromPost(row.draft.postId);
            await releases.scheduleTarget(
              group.id,
              row.draft.postId,
              row.scheduledAt,
            );
            setOutcomes((current) => ({
              ...current,
              [row.draft.postId]: 'scheduled',
            }));
          } catch (caught) {
            logger.error('Failed to schedule a first post', caught);
            setOutcomes((current) => ({
              ...current,
              [row.draft.postId]: 'failed',
            }));
            setError('schedule');
          }
        }
      } catch (caught) {
        logger.error('Failed to schedule the first posts', caught);
        setError('schedule');
      } finally {
        setIsScheduling(false);
      }
    })();
  }, [getToken, imageIngredientId, isScheduling, rows]);

  return { connect, error, isLoading, isScheduling, rows, schedule };
}
