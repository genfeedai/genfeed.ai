'use client';

import { brandIdentitySnapshotV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  BrandIdentityPreviewInput,
  BrandIdentityPreviewState,
} from '@genfeedai/props/content/branded-generation-receipt.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  AuthenticationTokenUnavailableError,
  useAuthedService,
} from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ReadState = Omit<BrandIdentityPreviewState, 'refresh' | 'close'>;
const empty: ReadState = { result: null, isLoading: false, error: null };

function safeError(error: unknown): ReadState['error'] {
  const member = getJsonApiErrorMember(error);
  const reasons = [member?.code, member?.detail, member?.title];
  if (reasons.includes('brand_identity_integrity_failed'))
    return 'integrity_failed';
  if (reasons.includes('brand_identity_asset_unavailable'))
    return 'assets_unavailable';
  if (
    reasons.some((reason) =>
      [
        'brand_identity_unavailable',
        'brand_identity_snapshot_unavailable',
      ].includes(reason ?? ''),
    )
  )
    return 'unavailable';
  if (error instanceof AuthenticationTokenUnavailableError)
    return 'unavailable';
  const status =
    member?.status ??
    (isAxiosError(error) ? error.response?.status : undefined);
  if ([401, 403, 404].includes(status ?? 0)) return 'unavailable';
  if (error instanceof Error && error.message === 'receipt_response_invalid')
    return 'integrity_failed';
  return 'load_failed';
}

export function useBrandIdentityPreview(
  input: BrandIdentityPreviewInput,
): BrandIdentityPreviewState {
  const getService = useAuthedService((token) =>
    BrandedGenerationReceiptsService.getInstance(token),
  );
  const role = useUserRole();
  const { userId, sessionId, orgId, isLoaded, isSignedIn, getToken } =
    useAuthIdentity();
  const { organizationId, brandId, refreshKey, isOpen } = input;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const identity = useMemo(
    () => ({
      organizationId,
      brandId,
      refreshKey,
      isOpen,
      getService,
      role,
      userId,
      sessionId,
      orgId,
      isLoaded,
      isSignedIn,
      getToken,
      refreshVersion,
    }),
    [
      organizationId,
      brandId,
      refreshKey,
      isOpen,
      getService,
      role,
      userId,
      sessionId,
      orgId,
      isLoaded,
      isSignedIn,
      getToken,
      refreshVersion,
    ],
  );
  const current = useRef(identity);
  current.current = identity;
  const epoch = useRef(0);
  const request = useRef<AbortController | null>(null);
  const [stored, setStored] = useState<{
    identity: typeof identity;
    value: ReadState;
  }>({ identity, value: empty });
  // Scope comparison happens during render, before effects or asynchronous continuations.
  const value = stored.identity === identity && isOpen ? stored.value : empty;
  const update = useCallback(
    (change: Partial<ReadState>) => {
      if (current.current !== identity) return;
      setStored((previous) => ({
        identity,
        value: {
          ...(previous.identity === identity ? previous.value : empty),
          ...change,
        },
      }));
    },
    [identity],
  );
  const close = useCallback(() => {
    if (current.current !== identity) return;
    request.current?.abort();
    ++epoch.current;
    update(empty);
  }, [identity, update]);
  const refresh = useCallback(() => {
    if (current.current !== identity) return;
    close();
    setRefreshVersion((version) => version + 1);
  }, [identity, close]);

  // Run after useAuthedService has refreshed its token/factory refs for this render.
  useEffect(() => {
    const number = ++epoch.current;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const isCurrent = () =>
      !controller.signal.aborted &&
      epoch.current === number &&
      current.current === identity;
    const hasScope =
      isLoaded &&
      isSignedIn &&
      !!userId &&
      learningContractIdSchema.safeParse(organizationId).success &&
      learningContractIdSchema.safeParse(brandId).success;
    update({
      ...empty,
      isLoading: isOpen && hasScope,
      error: isOpen && !hasScope ? 'unavailable' : null,
    });
    if (isOpen && hasScope) {
      void (async () => {
        try {
          const service = await getService();
          if (!isCurrent()) return;
          const result = await service.getIdentityPreview(
            organizationId,
            brandId,
            undefined,
            controller.signal,
          );
          if (!isCurrent()) return;
          const parsed = brandIdentitySnapshotV1Schema.safeParse(
            result.snapshot,
          );
          if (!parsed.success) throw new Error('receipt_response_invalid');
          const snapshot = parsed.data;
          if (
            result.source !== 'current_approved_revision' ||
            result.id !== snapshot.contentHash ||
            snapshot.organizationId !== organizationId ||
            snapshot.brandId !== brandId ||
            snapshot.approval !== 'approved'
          )
            throw new Error('receipt_response_invalid');
          update({ result: { ...result, snapshot }, error: null });
        } catch (error) {
          if (isCurrent()) update({ ...empty, error: safeError(error) });
        } finally {
          if (isCurrent()) update({ isLoading: false });
        }
      })();
    }
    return () => {
      controller.abort();
      ++epoch.current;
    };
  }, [
    identity,
    organizationId,
    brandId,
    isOpen,
    getService,
    update,
    isLoaded,
    isSignedIn,
    userId,
  ]);
  return { ...value, refresh, close };
}
