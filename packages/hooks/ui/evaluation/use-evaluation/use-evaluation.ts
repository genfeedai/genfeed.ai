import type { IEvaluation } from '@genfeedai/client/models';
import { IngredientCategory, Status } from '@genfeedai/enums';
import { EvaluationsService } from '@genfeedai/services/ai/evaluations.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketSubscription } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseEvaluationOptions {
  contentId: string;
  contentType: IngredientCategory | 'article' | 'post';
  autoFetch?: boolean;
}

/**
 * Hook for managing content evaluations
 *
 * Provides methods to fetch existing evaluations and trigger new ones
 * Handles loading states and error notifications
 *
 * @param options - Configuration options
 * @param options.contentId - The ID of the content to evaluate
 * @param options.contentType - The type of content (image, video, article, post)
 * @param options.autoFetch - Whether to fetch evaluation on mount (default: true)
 * @returns Object with evaluation data and control functions
 */
export function useEvaluation({
  contentId,
  contentType,
  autoFetch = true,
}: UseEvaluationOptions) {
  const [evaluation, setEvaluation] = useState<IEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getEvaluationsService = useAuthedService((token: string) =>
    EvaluationsService.getInstance(token),
  );

  /**
   * Get endpoint name for logging based on content type
   */
  const getEndpointName = useCallback(
    (method: 'GET' | 'POST') => {
      const typeMap: Record<string, string> = {
        [IngredientCategory.IMAGE]: 'images',
        [IngredientCategory.VIDEO]: 'videos',
        article: 'articles',
        post: 'posts',
      };
      const typePath = typeMap[contentType] || contentType;
      return `${method} /evaluations/${typePath}/${contentId}`;
    },
    [contentId, contentType],
  );

  /**
   * Fetch the latest evaluation for the content
   */
  const fetchEvaluation = useCallback(async () => {
    if (!contentId) {
      return;
    }

    const url = getEndpointName('GET');
    setIsLoading(true);

    try {
      const service = await getEvaluationsService();

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

      if (evaluations && evaluations.length > 0) {
        // API returns evaluations sorted by evaluatedAt descending
        setEvaluation(evaluations[0]);
        logger.debug(
          `${url} success - found ${evaluations.length} evaluations`,
        );
      } else {
        setEvaluation(null);
        logger.debug(`${url} success - no evaluations found`);
      }
    } catch (error: unknown) {
      logger.error(`${url} failed`, error);
      // Don't show error notification for fetch - it's not critical
    } finally {
      setIsLoading(false);
    }
  }, [contentId, contentType, getEvaluationsService, getEndpointName]);

  // Track current evaluation ID for WebSocket subscription
  const currentEvaluationIdRef = useRef<string | null>(null);

  /**
   * Handle WebSocket updates for evaluation completion
   */
  const handleEvaluationUpdate = useCallback(
    (data: { status: Status; result?: IEvaluation; error?: string }) => {
      logger.debug('Evaluation WebSocket update received', data);

      if (data.status === Status.COMPLETED && data.result) {
        setEvaluation(data.result);
        setIsEvaluating(false);

        notificationsService.success('Content evaluated successfully');
        currentEvaluationIdRef.current = null;
      } else if (data.status === Status.FAILED) {
        setIsEvaluating(false);
        notificationsService.error(data.error || 'Evaluation failed');
        currentEvaluationIdRef.current = null;
      }
    },
    [notificationsService],
  );

  // Subscribe to WebSocket for current evaluation
  const wsEvent = currentEvaluationIdRef.current
    ? `/evaluations/${currentEvaluationIdRef.current}`
    : '';

  useSocketSubscription(wsEvent, handleEvaluationUpdate);

  /**
   * Trigger a new evaluation for the content
   * Cost: 1 credit
   * Returns immediately with PROCESSING status, updates via WebSocket
   */
  const evaluate = useCallback(async () => {
    if (!contentId) {
      return;
    }

    const url = getEndpointName('POST');
    setIsEvaluating(true);

    try {
      const service = await getEvaluationsService();

      let result;
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

      // CRITICAL: Set ref BEFORE setEvaluation to avoid WebSocket race condition
      // The ref must be set first so the next render computes the correct wsEvent
      // and establishes the subscription before any WebSocket messages arrive
      currentEvaluationIdRef.current = result.id;

      // Set the evaluation immediately (will be in PROCESSING status)
      setEvaluation(result);
      logger.info(
        `${url} initiated - waiting for WebSocket completion`,
        result,
      );

      // If already completed (fast path), handle immediately
      if (result.status === Status.COMPLETED) {
        setIsEvaluating(false);
        notificationsService.success('Content evaluated successfully');
        currentEvaluationIdRef.current = null;
      }
      // Note: isEvaluating stays true for PROCESSING, WebSocket will update it

      return result;
    } catch (error: unknown) {
      logger.error(`${url} failed`, error);
      setIsEvaluating(false);

      // Check for insufficient credits error
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'status' in error.response &&
        error.response.status === 403
      ) {
        notificationsService.error('Insufficient credits for evaluation');
      } else {
        notificationsService.error('Failed to evaluate content');
      }

      throw error;
    }
  }, [
    contentId,
    contentType,
    getEvaluationsService,
    notificationsService,
    getEndpointName,
  ]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch && contentId) {
      fetchEvaluation();
    }
  }, [autoFetch, contentId, fetchEvaluation]);

  return {
    /** Trigger a new evaluation (costs 1 credit) */
    evaluate,
    /** The most recent evaluation for the content */
    evaluation,
    /** Whether a new evaluation is in progress */
    isEvaluating,
    /** Whether the evaluation is being fetched */
    isLoading,
    /** Refresh the evaluation data */
    refetch: fetchEvaluation,
  };
}
