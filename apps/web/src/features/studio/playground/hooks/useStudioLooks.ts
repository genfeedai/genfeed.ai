'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  IStudioLook,
  StudioLookAssetType,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { buildStudioLookPayload } from '@genfeedai/helpers/studio-look.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StudioLooksService } from '@services/content/studio-looks.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_LOOKS: readonly IStudioLook[] = [];
const LOAD_ERROR = 'Saved Looks could not be loaded.';

interface StudioLooksMutationState {
  deletingId: string | null;
  error: string | null;
  isSaving: boolean;
  scopeKey: string;
  epoch: number;
}

export interface UseStudioLooksReturn {
  deleteLook: (id: string) => Promise<boolean>;
  deletingId: string | null;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  looks: readonly IStudioLook[];
  saveLook: (label: string, values: GenerationSetupValues) => Promise<boolean>;
}

export function isStudioLookAssetType(
  type: StudioPlaygroundType,
): type is StudioLookAssetType {
  return type === 'image' || type === 'video';
}

export {
  buildStudioLookPayload,
  presetToGenerationSetupValues,
} from '@genfeedai/helpers/studio-look.helper';

/**
 * The saved Looks for one asset type. The list is cached per organization,
 * brand, asset type, session and API, so reopening Studio paints the last
 * Looks at once and refreshes them in the background; another scope never
 * sees them, and a superseded read is cancelled. Saves and deletes write into
 * that cache, and only while their scope is still the current one.
 */
export function useStudioLooks(
  type: StudioPlaygroundType,
): UseStudioLooksReturn {
  const { brandId, organizationId } = useBrand();
  const { userId, sessionId } = useAuthIdentity();
  const assetType = isStudioLookAssetType(type) ? type : null;
  const scopeKey = assetType
    ? JSON.stringify([
        organizationId,
        brandId,
        userId,
        sessionId,
        EnvironmentService.apiEndpoint,
        assetType,
      ])
    : '';
  const ownerRef = useRef({ scopeKey, epoch: 0 });
  if (ownerRef.current.scopeKey !== scopeKey)
    ownerRef.current = { scopeKey, epoch: ownerRef.current.epoch + 1 };
  const owner = ownerRef.current;
  const isMounted = useRef(true);
  const isCurrentOwner = useCallback(
    () => isMounted.current && ownerRef.current === owner,
    [owner],
  );

  const [mutation, setMutation] = useState<StudioLooksMutationState>({
    deletingId: null,
    error: null,
    isSaving: false,
    scopeKey: '',
    epoch: -1,
  });

  const getStudioLooksService = useAuthedService((token: string) =>
    StudioLooksService.getInstance(token),
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const queryClient = useQueryClient();
  const apiEndpoint = EnvironmentService.apiEndpoint;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the API endpoint is read through a getter and can change between renders.
  const looksQueryKey = useMemo<QueryKey>(
    () => [
      'studio-looks',
      organizationId,
      brandId,
      assetType,
      sessionId ?? null,
      apiEndpoint,
    ],
    [apiEndpoint, assetType, brandId, organizationId, sessionId],
  );
  const looksQuery = useAuthedQuery<StudioLooksService, IStudioLook[]>({
    enabled: Boolean(assetType && brandId && organizationId),
    queryFn: async (service, signal) => {
      // A read superseded while it waited for its token never reaches the API.
      signal.throwIfAborted();
      if (!assetType) {
        return [];
      }
      try {
        return await service.findForAssetType(assetType, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load Studio Looks', error);
        }
        throw error;
      }
    },
    queryKey: looksQueryKey,
    service: (token: string) => StudioLooksService.getInstance(token),
  });

  const updateCachedLooks = useCallback(
    (update: (looks: IStudioLook[]) => IStudioLook[]) => {
      queryClient.setQueriesData<IStudioLook[]>(
        { queryKey: looksQueryKey },
        (current) => (current ? update(current) : current),
      );
    },
    [looksQueryKey, queryClient],
  );

  const saveLook = useCallback(
    async (label: string, values: GenerationSetupValues) => {
      if (!assetType || !scopeKey || !label.trim() || !isCurrentOwner()) {
        return false;
      }
      const payload = buildStudioLookPayload(label, assetType, values);
      setMutation({
        deletingId: null,
        error: null,
        isSaving: true,
        scopeKey,
        epoch: owner.epoch,
      });
      try {
        const service = await getStudioLooksService();
        if (!isCurrentOwner()) return false;
        const created = await service.post(payload);
        if (!isCurrentOwner()) return false;
        updateCachedLooks((looks) => [created, ...looks]);
        setMutation({
          deletingId: null,
          error: null,
          isSaving: false,
          scopeKey,
          epoch: owner.epoch,
        });
        return true;
      } catch (error) {
        if (!isCurrentOwner()) return false;
        logger.error('Failed to save Studio Look', error);
        setMutation({
          deletingId: null,
          error: 'This Look could not be saved. Your settings are unchanged.',
          isSaving: false,
          scopeKey,
          epoch: owner.epoch,
        });
        return false;
      }
    },
    [
      assetType,
      getStudioLooksService,
      isCurrentOwner,
      owner,
      scopeKey,
      updateCachedLooks,
    ],
  );

  const deleteLook = useCallback(
    async (id: string) => {
      if (!scopeKey || !isCurrentOwner()) {
        return false;
      }
      setMutation({
        deletingId: id,
        error: null,
        isSaving: false,
        scopeKey,
        epoch: owner.epoch,
      });
      try {
        const service = await getStudioLooksService();
        if (!isCurrentOwner()) return false;
        await service.removeLook(id);
        if (!isCurrentOwner()) return false;
        updateCachedLooks((looks) => looks.filter((look) => look.id !== id));
        setMutation({
          deletingId: null,
          error: null,
          isSaving: false,
          scopeKey,
          epoch: owner.epoch,
        });
        return true;
      } catch (error) {
        if (!isCurrentOwner()) return false;
        logger.error('Failed to delete Studio Look', error);
        setMutation({
          deletingId: null,
          error: 'This Look could not be deleted.',
          isSaving: false,
          scopeKey,
          epoch: owner.epoch,
        });
        return false;
      }
    },
    [getStudioLooksService, isCurrentOwner, owner, scopeKey, updateCachedLooks],
  );

  const looks = assetType ? (looksQuery.data ?? EMPTY_LOOKS) : EMPTY_LOOKS;
  const loadError = assetType && looksQuery.isError ? LOAD_ERROR : null;
  const isLoading = Boolean(assetType) && looksQuery.isLoading;

  return useMemo(() => {
    const currentMutation =
      mutation.scopeKey === scopeKey && mutation.epoch === owner.epoch
        ? mutation
        : { deletingId: null, error: null, isSaving: false };

    return {
      deleteLook,
      deletingId: currentMutation.deletingId,
      error: currentMutation.error ?? loadError,
      isLoading,
      isSaving: currentMutation.isSaving,
      looks,
      saveLook,
    };
  }, [
    deleteLook,
    isLoading,
    loadError,
    looks,
    mutation,
    owner,
    saveLook,
    scopeKey,
  ]);
}
