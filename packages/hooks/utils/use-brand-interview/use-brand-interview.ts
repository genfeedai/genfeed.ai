'use client';

import type {
  IBrandInterviewProgress,
  IBrandInterviewQuestion,
} from '@genfeedai/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import {
  BrandInterviewService,
  type IActiveBrandInterview,
} from '@genfeedai/services/social/brand-interview.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useRef, useState } from 'react';

export type BrandInterviewUiStatus = 'idle' | 'in_progress' | 'complete';

export interface UseBrandInterviewReturn {
  status: BrandInterviewUiStatus;
  interviewId: string | null;
  currentQuestion: IBrandInterviewQuestion | null;
  progress: IBrandInterviewProgress | null;
  completenessScore: number;
  isLoading: boolean;
  error: string | null;
  startInterview: () => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  skipQuestion: () => Promise<void>;
}

export function useBrandInterview(
  brandId: string | null | undefined,
): UseBrandInterviewReturn {
  const [status, setStatus] = useState<BrandInterviewUiStatus>('idle');
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] =
    useState<IBrandInterviewQuestion | null>(null);
  const [progress, setProgress] = useState<IBrandInterviewProgress | null>(
    null,
  );
  const [completenessScore, setCompletenessScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const getInterviewService = useAuthedService((token: string) =>
    BrandInterviewService.getInstance(token),
  );

  // Resume any active session on mount
  useEffect(() => {
    mountedRef.current = true;

    if (!brandId) {
      return;
    }

    const controller = new AbortController();

    const checkActiveSession = async () => {
      setIsLoading(true);

      try {
        const service = await getInterviewService();
        const active: IActiveBrandInterview | null =
          await service.getActiveInterview(brandId, controller.signal);

        if (!mountedRef.current || controller.signal.aborted) {
          return;
        }

        if (active && active.status === 'in_progress') {
          setInterviewId(active.id);
          setCurrentQuestion(active.currentQuestion);
          setCompletenessScore(active.completenessScore);
          setStatus('in_progress');
          logger.info('Resumed active brand interview', { id: active.id });
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        const e = err as Error;

        if (e?.name !== 'AbortError') {
          logger.error('Failed to check active interview session', err);
        }
      } finally {
        if (mountedRef.current && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    checkActiveSession();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [brandId, getInterviewService]);

  const startInterview = useCallback(async () => {
    if (!brandId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    try {
      const service = await getInterviewService();
      const result = await service.startInterview(brandId, {
        signal: controller.signal,
      });

      if (!mountedRef.current) {
        return;
      }

      setInterviewId(result.interviewId);
      setCurrentQuestion(result.currentQuestion);
      setProgress(result.progress);
      setCompletenessScore(result.completenessScore);
      setStatus(result.status === 'completed' ? 'complete' : 'in_progress');

      logger.info('Started brand interview', {
        id: result.interviewId,
        creditsCharged: result.creditsCharged,
      });
    } catch (err: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const e = err as Error;

      if (e?.name !== 'AbortError') {
        logger.error('Failed to start interview', err);
        setError('Failed to start the interview. Please try again.');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [brandId, getInterviewService]);

  const submitAnswer = useCallback(
    async (answer: string) => {
      if (!interviewId) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const service = await getInterviewService();
        const result = await service.submitAnswer(interviewId, answer);

        if (!mountedRef.current) {
          return;
        }

        setCurrentQuestion(result.nextQuestion);
        setProgress(result.progress);
        setCompletenessScore(result.completenessScore);
        setStatus(result.isComplete ? 'complete' : 'in_progress');

        logger.info('Submitted interview answer', {
          id: result.interviewId,
          isComplete: result.isComplete,
        });
      } catch (err: unknown) {
        if (!mountedRef.current) {
          return;
        }

        const e = err as Error;

        if (e?.name !== 'AbortError') {
          logger.error('Failed to submit interview answer', err);
          setError('Failed to submit your answer. Please try again.');
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [interviewId, getInterviewService],
  );

  const skipQuestion = useCallback(async () => {
    if (!interviewId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const service = await getInterviewService();
      const result = await service.skipQuestion(interviewId);

      if (!mountedRef.current) {
        return;
      }

      setCurrentQuestion(result.nextQuestion);
      setProgress(result.progress);
      setCompletenessScore(result.completenessScore);
      setStatus(result.isComplete ? 'complete' : 'in_progress');

      logger.info('Skipped interview question', {
        id: result.interviewId,
        isComplete: result.isComplete,
      });
    } catch (err: unknown) {
      if (!mountedRef.current) {
        return;
      }

      const e = err as Error;

      if (e?.name !== 'AbortError') {
        logger.error('Failed to skip interview question', err);
        setError('Failed to skip the question. Please try again.');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [interviewId, getInterviewService]);

  return {
    completenessScore,
    currentQuestion,
    error,
    interviewId,
    isLoading,
    progress,
    skipQuestion,
    startInterview,
    status,
    submitAnswer,
  };
}
