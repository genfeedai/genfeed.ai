'use client';
import type {
  BrandedGenerationReceiptInspectorInput,
  BrandedGenerationReceiptInspectorState,
} from '@genfeedai/props/content/branded-generation-receipt.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { isAxiosError } from 'axios';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

type ReadState = Omit<
  BrandedGenerationReceiptInspectorState,
  'refresh' | 'revealPrompt' | 'hidePrompt'
>;
const empty: ReadState = {
  receipt: null,
  isLoading: false,
  error: null,
  prompts: {},
  loadingPrompt: null,
  promptError: null,
};
function status(error: unknown) {
  return isAxiosError(error) ? error.response?.status : undefined;
}
function useSnapshotState(input: BrandedGenerationReceiptInspectorInput) {
  const getService = useAuthedService((token) =>
    BrandedGenerationReceiptsService.getInstance(token),
  );
  const { organizationId, brandId, receiptId, revision, isOpen } = input;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const identity = useMemo(
    () => ({
      organizationId,
      brandId,
      receiptId,
      revision,
      isOpen,
      getService,
      refreshVersion,
    }),
    [
      organizationId,
      brandId,
      receiptId,
      revision,
      isOpen,
      getService,
      refreshVersion,
    ],
  );
  const current = useRef(identity);
  current.current = identity;
  const epoch = useRef(0),
    metadata = useRef<AbortController | null>(null),
    prompt = useRef<AbortController | null>(null);
  const [stored, setStored] = useState<{
    identity: typeof identity;
    value: ReadState;
  }>({ identity, value: empty });
  const value = stored.identity === identity && isOpen ? stored.value : empty;
  const update = useCallback(
    (change: Partial<ReadState>) => {
      if (current.current === identity)
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
  const refresh = useCallback(() => {
    metadata.current?.abort();
    prompt.current?.abort();
    prompt.current = null;
    ++epoch.current;
    update(empty);
    setRefreshVersion((v) => v + 1);
  }, [update]);
  return { identity, current, epoch, metadata, prompt, value, update, refresh };
}
function useSnapshotMetadata(runtime: ReturnType<typeof useSnapshotState>) {
  const { identity, current, epoch, metadata, prompt, update } = runtime;
  useLayoutEffect(() => {
    const { isOpen, organizationId, brandId, receiptId, revision, getService } =
      identity;
    const number = ++epoch.current,
      controller = new AbortController();
    metadata.current?.abort();
    prompt.current?.abort();
    metadata.current = controller;
    prompt.current = null;
    update({
      ...empty,
      isLoading: isOpen && !!organizationId && !!brandId && !!receiptId,
    });
    if (isOpen && organizationId && brandId && receiptId) {
      void (async () => {
        try {
          const service = await getService();
          if (controller.signal.aborted) return;
          const receipt =
            revision === undefined
              ? await service.get(brandId, receiptId, controller.signal)
              : await service.getRevision(
                  brandId,
                  receiptId,
                  revision,
                  controller.signal,
                );
          if (
            !controller.signal.aborted &&
            epoch.current === number &&
            current.current === identity
          )
            update({ receipt });
        } catch (error) {
          if (
            !controller.signal.aborted &&
            epoch.current === number &&
            current.current === identity
          )
            update({
              ...empty,
              error: [401, 403, 404].includes(status(error) ?? 0)
                ? 'unavailable'
                : 'load_failed',
            });
        } finally {
          if (
            !controller.signal.aborted &&
            epoch.current === number &&
            current.current === identity
          )
            update({ isLoading: false });
        }
      })();
    }
    return () => {
      controller.abort();
      prompt.current?.abort();
      ++epoch.current;
    };
  }, [identity, current, epoch, metadata, prompt, update]);
}
function useSnapshotPrompts(runtime: ReturnType<typeof useSnapshotState>) {
  const { identity, current, epoch, prompt, value, update } = runtime;
  const hidePrompt = useCallback(
    (
      stage: Parameters<
        BrandedGenerationReceiptInspectorState['hidePrompt']
      >[0],
    ) => {
      if (current.current !== identity) return;
      prompt.current?.abort();
      prompt.current = null;
      const prompts = { ...value.prompts };
      delete prompts[stage];
      update({ prompts, loadingPrompt: null, promptError: null });
    },
    [identity, current, prompt, value.prompts, update],
  );
  const revealPrompt = useCallback(
    async (
      stage: Parameters<
        BrandedGenerationReceiptInspectorState['revealPrompt']
      >[0],
    ) => {
      const receipt = value.receipt,
        reference = receipt?.prompts[stage];
      if (
        current.current !== identity ||
        !identity.isOpen ||
        !receipt ||
        reference?.retention !== 'retained' ||
        prompt.current
      )
        return;
      const controller = new AbortController();
      prompt.current = controller;
      const number = epoch.current;
      update({ loadingPrompt: stage, promptError: null });
      try {
        const service = await identity.getService();
        if (controller.signal.aborted) return;
        const result = await service.readPrompt(
          identity.brandId,
          identity.receiptId,
          receipt.revision,
          stage,
          controller.signal,
        );
        if (
          result.status === 'retained' &&
          result.contentHash !== reference.contentHash
        )
          throw new Error('receipt_response_invalid');
        if (
          !controller.signal.aborted &&
          number === epoch.current &&
          current.current === identity
        )
          update({ prompts: { ...value.prompts, [stage]: result } });
      } catch (error) {
        if (
          !controller.signal.aborted &&
          number === epoch.current &&
          current.current === identity
        )
          update({
            prompts: {},
            promptError:
              status(error) === 403
                ? 'restricted'
                : [401, 404].includes(status(error) ?? 0)
                  ? 'unavailable'
                  : 'load_failed',
          });
      } finally {
        if (
          !controller.signal.aborted &&
          number === epoch.current &&
          current.current === identity
        ) {
          prompt.current = null;
          update({ loadingPrompt: null });
        }
      }
    },
    [value.receipt, value.prompts, identity, current, epoch, prompt, update],
  );
  return { hidePrompt, revealPrompt };
}
export function useBrandedGenerationReceipt(
  input: BrandedGenerationReceiptInspectorInput,
): BrandedGenerationReceiptInspectorState {
  const runtime = useSnapshotState(input);
  useSnapshotMetadata(runtime);
  const actions = useSnapshotPrompts(runtime);
  return { ...runtime.value, ...actions, refresh: runtime.refresh };
}
