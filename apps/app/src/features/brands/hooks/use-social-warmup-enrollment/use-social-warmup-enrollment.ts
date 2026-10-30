'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { ISocialWarmupEnrollment } from '@genfeedai/contracts/interfaces';
import { SocialWarmupEnrollmentsService } from '@genfeedai/services/social/social-warmup-enrollments.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  UseSocialWarmupEnrollmentOptions,
  UseSocialWarmupEnrollmentResult,
} from '@props/social/social-warmup-enrollments.props';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

export const SOCIAL_WARMUP_ENROLLMENT_QUERY_KEY = 'social-warmup-enrollment';

export function useSocialWarmupEnrollment(
  options: UseSocialWarmupEnrollmentOptions = {},
): UseSocialWarmupEnrollmentResult {
  const { autoLoad = true, credentialId } = options;
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useBrand();
  const queryClient = useQueryClient();

  const getService = useAuthedService((token: string) =>
    SocialWarmupEnrollmentsService.getInstance(token),
  );

  const queryKey = useMemo(
    () => [SOCIAL_WARMUP_ENROLLMENT_QUERY_KEY, brandId, credentialId],
    [brandId, credentialId],
  );

  const {
    data = null,
    error,
    isLoading,
    refetch,
  } = useQuery({
    enabled: autoLoad && !!isSignedIn && !!credentialId,
    queryFn: async () => {
      const service = await getService();
      const params: Record<string, string> = {};
      if (brandId) {
        params.brand = brandId;
      }
      if (credentialId) {
        params.credential = credentialId;
      }
      const enrollments = (await service.findAll(
        params,
      )) as ISocialWarmupEnrollment[];
      return enrollments[0] ?? null;
    },
    queryKey,
  });

  const invalidateEnrollment = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [SOCIAL_WARMUP_ENROLLMENT_QUERY_KEY],
    });
  }, [queryClient]);

  const enroll = useCallback(
    async (nextCredentialId: string) => {
      const service = await getService();
      const enrollment = await service.enroll({
        credentialId: nextCredentialId,
      });
      queryClient.setQueryData(
        [SOCIAL_WARMUP_ENROLLMENT_QUERY_KEY, brandId, nextCredentialId],
        enrollment,
      );
      await invalidateEnrollment();
      return enrollment;
    },
    [brandId, getService, invalidateEnrollment, queryClient],
  );

  const completeItem = useCallback(
    async (itemId: string) => {
      if (!data?.id) {
        throw new Error('Social warm-up enrollment is required');
      }
      const service = await getService();
      const enrollment = await service.completeItem(data.id, itemId);
      queryClient.setQueryData(queryKey, enrollment);
      await invalidateEnrollment();
      return enrollment;
    },
    [data?.id, getService, invalidateEnrollment, queryClient, queryKey],
  );

  const reopenItem = useCallback(
    async (itemId: string) => {
      if (!data?.id) {
        throw new Error('Social warm-up enrollment is required');
      }
      const service = await getService();
      const enrollment = await service.reopenItem(data.id, itemId);
      queryClient.setQueryData(queryKey, enrollment);
      await invalidateEnrollment();
      return enrollment;
    },
    [data?.id, getService, invalidateEnrollment, queryClient, queryKey],
  );

  return {
    completeItem,
    data,
    enroll,
    error,
    isLoading,
    refresh: refetch,
    reopenItem,
  };
}
