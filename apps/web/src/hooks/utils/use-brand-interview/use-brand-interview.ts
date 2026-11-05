'use client';

import { BrandInterviewStatus } from '@genfeedai/contracts';
import type {
  BrandInterviewAnswerValue,
  IBrandInterviewAnswerResult,
  IBrandInterviewProgress,
  IBrandInterviewQuestion,
  IBrandInterviewStep,
} from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import {
  BrandInterviewService,
  type IActiveBrandInterview,
} from '@genfeedai/services/social/brand-interview.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export type BrandInterviewUiStatus = 'idle' | 'in_progress' | 'complete';

export interface UseBrandInterviewReturn {
  status: BrandInterviewUiStatus;
  interviewId: string | null;
  currentQuestion: IBrandInterviewQuestion | null;
  progress: IBrandInterviewProgress | null;
  completenessScore: number;
  isLoading: boolean;
  error: string | null;
  steps: IBrandInterviewStep[];
  answeredFields: Record<string, BrandInterviewAnswerValue>;
  startInterview: () => Promise<void>;
  submitAnswer: (answer: string, fieldKey?: string) => Promise<void>;
  skipQuestion: () => Promise<void>;
}

/** Where one brand's interview stands, as this hook shows it. */
interface BrandInterviewSession {
  answeredFields: Record<string, BrandInterviewAnswerValue>;
  completenessScore: number;
  currentQuestion: IBrandInterviewQuestion | null;
  interviewId: string;
  progress: IBrandInterviewProgress | null;
  steps: IBrandInterviewStep[];
}

/** An interview finished on this page, for the brand it belongs to. */
interface CompletedBrandInterview {
  brandId: string;
  session: BrandInterviewSession;
  viewerKey: string;
}

const EMPTY_ANSWERED_FIELDS: Record<string, BrandInterviewAnswerValue> = {};
const EMPTY_STEPS: IBrandInterviewStep[] = [];

function brandInterviewQueryKey(brandId: string | null | undefined) {
  return ['brand-interview', 'active', brandId ?? null] as const;
}

function createInterviewService(token: string): BrandInterviewService {
  return BrandInterviewService.getInstance(token);
}

function toActiveSession(
  active: IActiveBrandInterview | null,
): BrandInterviewSession | null {
  if (!active || active.status !== BrandInterviewStatus.IN_PROGRESS) {
    return null;
  }
  return {
    answeredFields: active.answeredFields ?? {},
    completenessScore: active.completenessScore,
    currentQuestion: active.currentQuestion,
    interviewId: active.id,
    progress: {
      answeredFields: active.answeredCount,
      percentComplete:
        active.totalCount > 0
          ? Math.round((active.answeredCount / active.totalCount) * 100)
          : 100,
      totalFields: active.totalCount,
    },
    steps: active.steps ?? [],
  };
}

function toAnswerSession(
  result: IBrandInterviewAnswerResult,
): BrandInterviewSession {
  return {
    answeredFields: result.answeredFields ?? {},
    completenessScore: result.completenessScore,
    currentQuestion: result.nextQuestion,
    interviewId: result.interviewId,
    progress: result.progress,
    steps: result.steps ?? [],
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Runs one brand's interview. The active session is cached per viewer and
 * brand, so coming back to the interview paints the current question at once
 * and refreshes it in the background. Each answer or skip writes the new
 * state into the cache. A finished interview is shown here until the page is
 * left; the cache then holds no active session, as the API does.
 */
export function useBrandInterview(
  brandId: string | null | undefined,
): UseBrandInterviewReturn {
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuthIdentity();
  // A finished interview belongs to the viewer who finished it.
  const viewerKey = `${userId ?? ''}:${orgId ?? ''}`;
  const getInterviewService = useAuthedService(createInterviewService);
  const [completed, setCompleted] = useState<CompletedBrandInterview | null>(
    null,
  );
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeQuery = useAuthedQuery<
    BrandInterviewService,
    BrandInterviewSession | null
  >({
    enabled: Boolean(brandId),
    queryFn: async (service, signal) => {
      if (!brandId) {
        return null;
      }
      try {
        const session = toActiveSession(
          await service.getActiveInterview(brandId, signal),
        );
        if (session) {
          logger.info('Resumed active brand interview', {
            id: session.interviewId,
          });
        }
        return session;
      } catch (err: unknown) {
        if (!isAbortError(err)) {
          logger.error('Failed to check active interview session', err);
        }
        throw err;
      }
    },
    queryKey: brandInterviewQueryKey(brandId),
    service: createInterviewService,
  });

  const completedSession =
    completed &&
    completed.brandId === brandId &&
    completed.viewerKey === viewerKey
      ? completed.session
      : null;
  const activeSession = activeQuery.data ?? null;
  const session = completedSession ?? activeSession;
  const status: BrandInterviewUiStatus = completedSession
    ? 'complete'
    : activeSession
      ? 'in_progress'
      : 'idle';

  /**
   * Writes the interview's new state: an unfinished one into the cache, a
   * finished one onto this page while the cache drops the active session.
   */
  const applySession = useCallback(
    async (next: BrandInterviewSession, isComplete: boolean) => {
      if (!brandId) {
        return;
      }
      const queryKey = brandInterviewQueryKey(brandId);
      // A refresh still in flight must not land over the newer state.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueriesData<BrandInterviewSession | null>(
        { queryKey },
        isComplete ? null : next,
      );
      setCompleted(isComplete ? { brandId, session: next, viewerKey } : null);
    },
    [brandId, queryClient, viewerKey],
  );

  const startInterview = useCallback(async () => {
    if (!brandId) {
      return;
    }

    setIsMutating(true);
    setError(null);

    const controller = new AbortController();

    try {
      const service = await getInterviewService();
      const result = await service.startInterview(brandId, {
        signal: controller.signal,
      });

      await applySession(
        {
          answeredFields: result.answeredFields ?? {},
          completenessScore: result.completenessScore,
          currentQuestion: result.currentQuestion,
          interviewId: result.interviewId,
          progress: result.progress,
          steps: result.steps ?? [],
        },
        result.status === BrandInterviewStatus.COMPLETED,
      );

      logger.info('Started brand interview', {
        creditsCharged: result.creditsCharged,
        id: result.interviewId,
      });
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        logger.error('Failed to start interview', err);
        setError('Failed to start the interview. Please try again.');
      }
    } finally {
      setIsMutating(false);
    }
  }, [applySession, brandId, getInterviewService]);

  const interviewId = session?.interviewId ?? null;

  const submitAnswer = useCallback(
    async (answer: string, fieldKey?: string) => {
      if (!interviewId) {
        return;
      }

      setIsMutating(true);
      setError(null);

      try {
        const service = await getInterviewService();
        const result = await service.submitAnswer(interviewId, answer, {
          fieldKey,
        });

        await applySession(toAnswerSession(result), result.isComplete);

        logger.info('Submitted interview answer', {
          id: result.interviewId,
          isComplete: result.isComplete,
        });
      } catch (err: unknown) {
        if (!isAbortError(err)) {
          logger.error('Failed to submit interview answer', err);
          setError('Failed to submit your answer. Please try again.');
        }
      } finally {
        setIsMutating(false);
      }
    },
    [applySession, getInterviewService, interviewId],
  );

  const skipQuestion = useCallback(async () => {
    if (!interviewId) {
      return;
    }

    setIsMutating(true);
    setError(null);

    try {
      const service = await getInterviewService();
      const result = await service.skipQuestion(interviewId);

      await applySession(toAnswerSession(result), result.isComplete);

      logger.info('Skipped interview question', {
        id: result.interviewId,
        isComplete: result.isComplete,
      });
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        logger.error('Failed to skip interview question', err);
        setError('Failed to skip the question. Please try again.');
      }
    } finally {
      setIsMutating(false);
    }
  }, [applySession, getInterviewService, interviewId]);

  return {
    answeredFields: session?.answeredFields ?? EMPTY_ANSWERED_FIELDS,
    completenessScore: session?.completenessScore ?? 0,
    currentQuestion: session?.currentQuestion ?? null,
    error,
    interviewId,
    isLoading: activeQuery.isLoading || isMutating,
    progress: session?.progress ?? null,
    skipQuestion,
    startInterview,
    status,
    steps: session?.steps ?? EMPTY_STEPS,
    submitAnswer,
  };
}
