'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { ISocialWarmupEnrollment } from '@genfeedai/interfaces';
import { SocialWarmupEnrollmentsService } from '@genfeedai/services/social/social-warmup-enrollments.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  UseSocialWarmupEnrollmentOptions,
  UseSocialWarmupEnrollmentResult,
} from '@props/social/social-warmup-enrollments.props';
import { useQuery } from '@tanstack/react-query';

export function useSocialWarmupEnrollment(
  options: UseSocialWarmupEnrollmentOptions = {},
): UseSocialWarmupEnrollmentResult {
  const { autoLoad = true, credentialId } = options;
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useBrand();

  const getService = useAuthedService((token: string) =>
    SocialWarmupEnrollmentsService.getInstance(token),
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
    queryKey: ['social-warmup-enrollment', brandId, credentialId],
  });

  async function enroll(nextCredentialId: string) {
    const service = await getService();
    return service.enroll({ credentialId: nextCredentialId });
  }

  async function completeItem(itemId: string) {
    if (!data?.id) {
      throw new Error('Social warm-up enrollment is required');
    }
    const service = await getService();
    return service.completeItem(data.id, itemId);
  }

  async function reopenItem(itemId: string) {
    if (!data?.id) {
      throw new Error('Social warm-up enrollment is required');
    }
    const service = await getService();
    return service.reopenItem(data.id, itemId);
  }

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
