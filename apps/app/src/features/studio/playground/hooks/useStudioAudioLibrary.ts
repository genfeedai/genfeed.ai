'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { AgentContentMentionItem } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useRef, useState } from 'react';
import { loadStudioAudioLibrary } from '@/features/studio/playground/utils/studio-audio-library';

const EMPTY_ITEMS: readonly AgentContentMentionItem[] = [];

export function useStudioAudioLibrary(isEnabled: boolean) {
  const { brandId, organizationId } = useBrand();
  const { userId, sessionId, orgId } = useAuthIdentity();
  const key = JSON.stringify([
    isEnabled,
    brandId,
    organizationId,
    orgId,
    userId,
    sessionId,
    EnvironmentService.apiEndpoint,
  ]);
  const ownerRef = useRef({ key, epoch: 0 });
  if (ownerRef.current.key !== key)
    ownerRef.current = { key, epoch: ownerRef.current.epoch + 1 };
  const owner = ownerRef.current;
  const [snapshot, setSnapshot] = useState({
    owner,
    items: EMPTY_ITEMS,
    isLoading: false,
    hasError: false,
  });
  const getService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  useEffect(() => {
    const controller = new AbortController();
    const canApply = () =>
      !controller.signal.aborted && ownerRef.current === owner;
    setSnapshot({
      owner,
      items: EMPTY_ITEMS,
      isLoading: Boolean(isEnabled && brandId && organizationId),
      hasError: false,
    });
    if (isEnabled && brandId && organizationId) {
      void (async () => {
        try {
          const service = await getService();
          if (!canApply()) return;
          const items = await loadStudioAudioLibrary(
            service,
            brandId,
            organizationId,
            controller.signal,
          );
          if (canApply())
            setSnapshot({ owner, items, isLoading: false, hasError: false });
        } catch (error) {
          if (canApply()) {
            logger.error('Failed to load Studio audio references', error);
            setSnapshot({
              owner,
              items: EMPTY_ITEMS,
              isLoading: false,
              hasError: true,
            });
          }
        }
      })();
    }
    return () => controller.abort();
  }, [brandId, getService, isEnabled, organizationId, owner]);

  return snapshot.owner === owner
    ? snapshot
    : { owner, items: EMPTY_ITEMS, isLoading: false, hasError: false };
}
