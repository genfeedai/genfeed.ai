import type { IEvaluation } from '@genfeedai/client/models';
import { IngredientCategory, Status } from '@genfeedai/contracts';
import { EvaluationsService } from '@genfeedai/services/ai/evaluations.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  invalidateEvaluationVideoRead,
  useEvaluationReadScopeKey,
} from '@hooks/ui/evaluation/use-evaluation/evaluation-read-cache';
import { useSocketSubscriptions } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface UseEvaluationOptions {
  contentId: string;
  contentType: IngredientCategory | 'article' | 'post';
  autoFetch?: boolean;
}

export function useEvaluation({
  contentId,
  contentType,
  autoFetch = true,
}: UseEvaluationOptions) {
  const scopeKey = useEvaluationReadScopeKey();
  const queryClient = useQueryClient();
  const identity = JSON.stringify([scopeKey, contentType, contentId]);
  const activeIdentity = useRef(identity);
  const epoch = useRef(0);
  const readSequence = useRef(0);
  const [evaluation, setEvaluation] = useState<IEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getEvaluationsService = useAuthedService((token: string) =>
    EvaluationsService.getInstance(token),
  );
  useLayoutEffect(() => {
    activeIdentity.current = identity;
    epoch.current += 1;
    readSequence.current += 1;
    setEvaluation(null);
    setIsLoading(false);
    setIsEvaluating(false);
    setPendingId(null);
    return () => {
      epoch.current += 1;
    };
  }, [identity]);
  const invalidateRead = useCallback(() => {
    if (scopeKey)
      void invalidateEvaluationVideoRead(queryClient, scopeKey).catch(
        (error: unknown) => {
          logger.error('Failed to refresh persisted evaluation reads', error);
        },
      );
  }, [queryClient, scopeKey]);

  const fetchEvaluation = useCallback(async () => {
    if (!contentId) return;
    const startedEpoch = epoch.current;
    const request = ++readSequence.current;
    const canApply = () =>
      activeIdentity.current === identity &&
      epoch.current === startedEpoch &&
      readSequence.current === request;
    setIsLoading(true);
    try {
      const service = await getEvaluationsService();
      if (!canApply()) return;
      let evaluations: IEvaluation[] = [];
      switch (contentType) {
        case IngredientCategory.IMAGE:
          evaluations = await service.getImageEvaluations(contentId);
          break;
        case IngredientCategory.VIDEO:
          evaluations = await service.getVideoEvaluations(contentId);
          break;
        case 'article':
          evaluations = await service.getArticleEvaluations(contentId);
          break;
        case 'post':
          evaluations = await service.getPostEvaluations(contentId);
          break;
        default:
          evaluations = [];
      }

      if (canApply()) setEvaluation(evaluations[0] ?? null);
    } catch (error: unknown) {
      if (canApply()) logger.error('Failed to read content evaluation', error);
    } finally {
      if (canApply()) setIsLoading(false);
    }
  }, [contentId, contentType, getEvaluationsService, identity]);

  const subscriptionEpoch = epoch.current;
  const handleEvaluationUpdate = useCallback(
    (data: { status: Status; result?: IEvaluation; error?: string }) => {
      if (
        !pendingId ||
        activeIdentity.current !== identity ||
        epoch.current !== subscriptionEpoch
      )
        return;
      if (data.result && data.result.id !== pendingId) return;
      if (data.status === Status.COMPLETED && data.result) {
        setEvaluation(data.result);
        setIsEvaluating(false);
        setPendingId(null);
        invalidateRead();
        notificationsService.success('Content evaluated successfully');
      } else if (data.status === Status.FAILED) {
        if (data.result) setEvaluation(data.result);
        setIsEvaluating(false);
        setPendingId(null);
        invalidateRead();
        notificationsService.error(data.error || 'Evaluation failed');
      }
    },
    [
      pendingId,
      identity,
      subscriptionEpoch,
      invalidateRead,
      notificationsService,
    ],
  );
  const wsSubscriptions = useMemo(
    () =>
      pendingId
        ? [
            {
              event: `/evaluations/${pendingId}`,
              handler: handleEvaluationUpdate,
            },
          ]
        : [],
    [pendingId, handleEvaluationUpdate],
  );
  useSocketSubscriptions(wsSubscriptions);

  const evaluate = useCallback(async () => {
    if (!contentId) return;
    const startedEpoch = epoch.current;
    const canApply = () =>
      activeIdentity.current === identity && epoch.current === startedEpoch;
    readSequence.current += 1;
    setIsEvaluating(true);
    setIsLoading(false);
    try {
      const service = await getEvaluationsService();
      if (!canApply()) return;
      let result: IEvaluation;
      switch (contentType) {
        case IngredientCategory.IMAGE:
          result = await service.evaluateImage(contentId);
          break;
        case IngredientCategory.VIDEO:
          result = await service.evaluateVideo(contentId);
          break;
        case 'article':
          result = await service.evaluateArticle(contentId);
          break;
        case 'post':
          result = await service.evaluatePost(contentId);
          break;
        default:
          throw new Error(`Unsupported content type: ${contentType}`);
      }

      if (!canApply()) return result;
      setEvaluation(result);
      invalidateRead();
      if (
        result.data.status === Status.COMPLETED ||
        result.data.status === Status.FAILED
      ) {
        setIsEvaluating(false);
        setPendingId(null);
        if (result.data.status === Status.COMPLETED)
          notificationsService.success('Content evaluated successfully');
        else notificationsService.error('Evaluation failed');
      } else setPendingId(result.id);
      return result;
    } catch (error: unknown) {
      if (canApply()) {
        logger.error('Failed to evaluate content', error);
        setIsEvaluating(false);
        if (
          error &&
          typeof error === 'object' &&
          'response' in error &&
          error.response &&
          typeof error.response === 'object' &&
          'status' in error.response &&
          error.response.status === 403
        )
          notificationsService.error('Insufficient credits for evaluation');
        else notificationsService.error('Failed to evaluate content');
      }
      throw error;
    }
  }, [
    contentId,
    contentType,
    getEvaluationsService,
    identity,
    invalidateRead,
    notificationsService,
  ]);
  useEffect(() => {
    if (autoFetch && contentId) void fetchEvaluation();
  }, [autoFetch, contentId, fetchEvaluation]);
  return {
    evaluate,
    evaluation,
    isEvaluating,
    isLoading,
    refetch: fetchEvaluation,
  };
}
