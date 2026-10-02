'use client';

import type {
  ReplaceStoryboardCharacter,
  StoryboardCharacterReplacement,
  StoryboardCharacterReplacements,
} from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import type { StoryboardCharacterReplaceProps } from '@genfeedai/props/studio/storyboard.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { useCallback, useEffect, useRef, useState } from 'react';

const empty: StoryboardCharacterReplacements = {
  operations: [],
  legacyReplacements: [],
};

export function useStoryboardCharacterReplacements({
  brandId,
  runId,
  shotId,
  saved,
}: Pick<
  StoryboardCharacterReplaceProps,
  'brandId' | 'runId' | 'shotId' | 'saved'
>) {
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const scope = JSON.stringify([brandId, runId, shotId]);
  const fence = useCharacterFence(scope);
  const serviceRef = useRef(getService);
  serviceRef.current = getService;
  const [collection, setCollection] = useState(empty);
  const [fallback, setFallback] = useState<StoryboardCharacterReplacement>();
  const [hasReadFailed, setHasReadFailed] = useState(false);
  const [hasSubmitFailed, setHasSubmitFailed] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stateScope, setStateScope] = useState(scope);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fence is a stable ref; mutable generations must not trigger discovery.
  const read = useCallback(
    async (operationId?: string) => {
      const active = fence.current;
      if (active.scope !== scope) return;
      active.controller?.abort();
      const controller = new AbortController();
      active.controller = controller;
      const request = ++active.read;
      const isCurrent = () =>
        fence.current === active &&
        active.scope === scope &&
        active.read === request &&
        !controller.signal.aborted;
      setIsReading(true);
      setHasReadFailed(false);
      try {
        const service = await serviceRef.current();
        if (!isCurrent()) return;
        if (operationId) {
          const receipt = await service.getStoryboardCharacterReplacementStatus(
            brandId,
            runId,
            shotId,
            operationId,
            controller.signal,
          );
          if (!isCurrent()) return;
          setCollection((previous) => ({
            ...previous,
            operations: previous.operations.map((item) =>
              item.operationId === operationId ? receipt : item,
            ),
          }));
        } else {
          const receipts = await service.listStoryboardCharacterReplacements(
            brandId,
            runId,
            shotId,
            controller.signal,
          );
          if (!isCurrent()) return;
          setCollection(receipts);
        }
      } catch {
        if (isCurrent()) setHasReadFailed(true);
      } finally {
        if (isCurrent()) setIsReading(false);
      }
    },
    [brandId, runId, shotId, scope],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: fence is a stable ref, invalidated by cleanup rather than reactive dependencies.
  useEffect(() => {
    setStateScope(scope);
    setCollection(empty);
    setFallback(undefined);
    setHasReadFailed(false);
    setHasSubmitFailed(false);
    setIsReading(false);
    setIsSubmitting(false);
    void read();
    return () => {
      fence.current.controller?.abort();
      fence.current = { ...fence.current, epoch: fence.current.epoch + 1 };
    };
  }, [scope, read]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new scope reinitializes only its saved fallback.
  useEffect(() => {
    if (!fence.current.hasSubmission && saved?.shotId === shotId)
      setFallback(saved);
  }, [saved, shotId, scope]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the stable fence ref has independent read and submission generations.
  const submit = useCallback(
    async (input: ReplaceStoryboardCharacter) => {
      const active = fence.current;
      if (active.scope !== scope) return;
      const request = ++active.submit;
      const isCurrent = () =>
        fence.current === active &&
        active.scope === scope &&
        active.submit === request;
      setIsSubmitting(true);
      setHasSubmitFailed(false);
      try {
        const service = await serviceRef.current();
        if (!isCurrent()) return;
        const result = await service.replaceStoryboardCharacter(
          brandId,
          runId,
          shotId,
          input,
        );
        if (!isCurrent()) return;
        active.hasSubmission = true;
        setFallback(result);
      } catch {
        if (isCurrent()) setHasSubmitFailed(true);
      } finally {
        if (isCurrent()) {
          setIsSubmitting(false);
          void read();
        }
      }
    },
    [brandId, runId, shotId, scope, read],
  );

  const visible = stateScope === scope ? collection : empty;
  const visibleFallback = stateScope === scope ? fallback : undefined;
  return {
    collection: visible,
    fallback: characterFallback(visible, visibleFallback, shotId),
    hasReadFailed: stateScope === scope && hasReadFailed,
    hasSubmitFailed: stateScope === scope && hasSubmitFailed,
    isReading: stateScope === scope && isReading,
    isSubmitting: stateScope === scope && isSubmitting,
    refreshRequests: () => read(),
    refreshStatus: (operationId: string) => read(operationId),
    submit,
  };
}

function useCharacterFence(scope: string) {
  const fence = useRef({
    scope,
    epoch: 0,
    read: 0,
    submit: 0,
    hasSubmission: false,
    controller: undefined as AbortController | undefined,
  });
  if (fence.current.scope !== scope) {
    fence.current.controller?.abort();
    fence.current = {
      scope,
      epoch: fence.current.epoch + 1,
      read: 0,
      submit: 0,
      hasSubmission: false,
      controller: undefined,
    };
  }
  return fence;
}

function characterFallback(
  collection: StoryboardCharacterReplacements,
  fallback: StoryboardCharacterReplacement | undefined,
  shotId: string,
) {
  if (!fallback || fallback.shotId !== shotId) return undefined;
  const accepted = new Set(
    collection.operations.flatMap((item) => item.acceptedRequestIds),
  );
  return !accepted.has(fallback.requestId) &&
    !collection.legacyReplacements.some(
      (item) => item.requestId === fallback.requestId,
    )
    ? fallback
    : undefined;
}
