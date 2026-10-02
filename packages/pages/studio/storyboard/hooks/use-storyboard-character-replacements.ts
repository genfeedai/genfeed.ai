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

type CharacterContext = Pick<
  StoryboardCharacterReplaceProps,
  'brandId' | 'runId' | 'shotId' | 'saved'
>;

export function useStoryboardCharacterReplacements({
  brandId,
  runId,
  shotId,
  saved,
}: CharacterContext) {
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const fence = useCharacterFence(
    JSON.stringify([brandId, runId, shotId]),
    getService,
  );
  const epoch = fence.current.epoch;
  const [collection, setCollection] = useState(empty);
  const [fallback, setFallback] = useState<StoryboardCharacterReplacement>();
  const [hasReadFailed, setHasReadFailed] = useState(false);
  const [hasSubmitFailed, setHasSubmitFailed] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stateEpoch, setStateEpoch] = useState(epoch);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fence is a stable ref; mutable generations must not trigger discovery.
  const read = useCallback(
    async (operationId?: string) => {
      const active = fence.current;
      if (!active.isActive || active.epoch !== epoch) return;
      active.controller?.abort();
      const controller = new AbortController();
      active.controller = controller;
      const request = ++active.read;
      const isCurrent = () =>
        fence.current === active &&
        active.isActive &&
        active.epoch === epoch &&
        active.read === request &&
        !controller.signal.aborted;
      setIsReading(true);
      setHasReadFailed(false);
      try {
        if (!isCurrent()) return;
        const service = await active.getService();
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
    [brandId, runId, shotId, epoch],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fence is a stable ref, invalidated by cleanup rather than reactive dependencies.
  useEffect(() => {
    const active = fence.current;
    active.isActive = true;
    setStateEpoch(epoch);
    setCollection(empty);
    setFallback(undefined);
    setHasReadFailed(false);
    setHasSubmitFailed(false);
    setIsReading(false);
    setIsSubmitting(false);
    void read();
    return () => {
      active.isActive = false;
      active.controller?.abort();
      active.read++;
      active.submit++;
    };
  }, [epoch, read]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new scope reinitializes only its saved fallback.
  useEffect(() => {
    const canUseSaved =
      fence.current.allowSaved && !fence.current.hasSubmission;
    if (canUseSaved && saved?.shotId === shotId) setFallback(saved);
  }, [saved, shotId, epoch]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the stable fence ref has independent read and submission generations.
  const submit = useCallback(
    async (input: ReplaceStoryboardCharacter) => {
      const active = fence.current;
      if (!active.isActive || active.epoch !== epoch) return;
      const request = ++active.submit;
      const isCurrent = () =>
        fence.current === active &&
        active.isActive &&
        active.epoch === epoch &&
        active.submit === request;
      setIsSubmitting(true);
      setHasSubmitFailed(false);
      try {
        if (!isCurrent()) return;
        const service = await active.getService();
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
    [brandId, runId, shotId, epoch, read],
  );
  return {
    contextEpoch: epoch,
    initialSaved: fence.current.allowSaved ? saved : undefined,
    ...characterVisibility(epoch, stateEpoch, collection, fallback, shotId),
    hasReadFailed: stateEpoch === epoch && hasReadFailed,
    hasSubmitFailed: stateEpoch === epoch && hasSubmitFailed,
    isReading: stateEpoch === epoch && isReading,
    isSubmitting: stateEpoch === epoch && isSubmitting,
    refreshRequests: () => read(),
    refreshStatus: (operationId: string) => read(operationId),
    submit,
  };
}

function useCharacterFence(
  scope: string,
  getService: () => Promise<ContentRunsService>,
) {
  const fence = useRef({
    scope,
    getService,
    isActive: true,
    allowSaved: true,
    epoch: 0,
    read: 0,
    submit: 0,
    hasSubmission: false,
    controller: undefined as AbortController | undefined,
  });
  if (
    fence.current.scope !== scope ||
    fence.current.getService !== getService
  ) {
    fence.current.controller?.abort();
    fence.current = {
      scope,
      getService,
      isActive: true,
      allowSaved: false,
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

function characterVisibility(
  epoch: number,
  stateEpoch: number,
  collection: StoryboardCharacterReplacements,
  fallback: StoryboardCharacterReplacement | undefined,
  shotId: string,
) {
  const visible = stateEpoch === epoch ? collection : empty;
  return {
    collection: visible,
    fallback: characterFallback(
      visible,
      stateEpoch === epoch ? fallback : undefined,
      shotId,
    ),
  };
}
