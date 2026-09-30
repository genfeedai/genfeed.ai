'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type { CreateStoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useRef, useState } from 'react';

/** A transport retry reuses the same UUID and cannot create a second unpaid draft. */
export function useCreateStoryboard() {
  const brandId = useBrandId();
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const activeBrand = useRef(brandId);
  activeBrand.current = brandId;
  const request = useRef<{ key: string; clientRequestId: string } | null>(null);
  const pending = useRef<Promise<string> | null>(null);
  const [state, setState] = useState<{
    brandId: string | null;
    isCreating: boolean;
    error: string | null;
  }>({ brandId, isCreating: false, error: null });
  async function create(input: Omit<CreateStoryboardRun, 'clientRequestId'>) {
    if (!brandId) throw new Error('Choose a brand.');
    if (pending.current) return pending.current;
    const key = JSON.stringify({ brandId, input });
    if (request.current?.key !== key)
      request.current = { key, clientRequestId: crypto.randomUUID() };
    const clientRequestId = request.current.clientRequestId;
    setState({ brandId, isCreating: true, error: null });
    const promise = Promise.resolve().then(async () => {
      try {
        const service = await getService();
        if (activeBrand.current !== brandId)
          throw new Error('Storyboard brand changed.');
        const run = await service.createStoryboardRun(brandId, {
          ...input,
          clientRequestId,
        });
        if (activeBrand.current !== brandId || run.brandId !== brandId)
          throw new Error('Storyboard brand changed.');
        return run.id;
      } catch (error) {
        if (activeBrand.current === brandId)
          setState({
            brandId,
            isCreating: false,
            error: getJsonApiErrorMessage(
              error,
              'Could not create storyboard. Your source is kept. Retry to continue.',
            ),
          });
        throw error;
      } finally {
        if (activeBrand.current === brandId)
          setState((current) => ({ ...current, isCreating: false }));
      }
    });
    pending.current = promise;
    try {
      return await promise;
    } finally {
      if (pending.current === promise) pending.current = null;
    }
  }
  return {
    create,
    isCreating: state.brandId === brandId && state.isCreating,
    error: state.brandId === brandId ? state.error : null,
  };
}
