import { BrandInterviewStatus } from '@genfeedai/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetActiveInterview = vi.fn();
const mockStartInterview = vi.fn();
const mockSubmitAnswer = vi.fn();
const mockSkipQuestion = vi.fn();
const mockGetInterviewService = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandInterview } from './use-brand-interview';

const QUESTION = {
  fieldKey: 'mission',
  question: 'What is your mission?',
};

const PROGRESS = {
  answeredFields: 1,
  percentComplete: 25,
  totalFields: 4,
};

describe('useBrandInterview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveInterview.mockResolvedValue(null);
    mockGetInterviewService.mockResolvedValue({
      getActiveInterview: mockGetActiveInterview,
      skipQuestion: mockSkipQuestion,
      startInterview: mockStartInterview,
      submitAnswer: mockSubmitAnswer,
    });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetInterviewService,
    );
  });

  it('stays idle without a brand id', () => {
    const { result } = renderHook(() => useBrandInterview(null));

    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(mockGetInterviewService).not.toHaveBeenCalled();
  });

  it('stays idle when there is no active session', async () => {
    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetActiveInterview).toHaveBeenCalledWith(
      'brand-1',
      expect.any(AbortSignal),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.interviewId).toBeNull();
  });

  it('resumes an active in-progress interview on mount', async () => {
    mockGetActiveInterview.mockResolvedValue({
      answeredCount: 1,
      answeredFields: { mission: 'answered' },
      completenessScore: 40,
      currentQuestion: QUESTION,
      id: 'interview-1',
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [{ id: 'step-1' }],
      totalCount: 4,
    });

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.status).toBe('in_progress');
    });

    expect(result.current.interviewId).toBe('interview-1');
    expect(result.current.currentQuestion).toEqual(QUESTION);
    expect(result.current.completenessScore).toBe(40);
    expect(result.current.answeredFields).toEqual({ mission: 'answered' });
    expect(result.current.progress).toEqual({
      answeredFields: 1,
      percentComplete: 25,
      totalFields: 4,
    });
  });

  it('reports 100 percent when the active session has no questions', async () => {
    mockGetActiveInterview.mockResolvedValue({
      answeredCount: 0,
      answeredFields: {},
      completenessScore: 0,
      currentQuestion: null,
      id: 'interview-1',
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [],
      totalCount: 0,
    });

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.status).toBe('in_progress');
    });

    expect(result.current.progress?.percentComplete).toBe(100);
  });

  it('survives a failed active-session check', async () => {
    mockGetActiveInterview.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('starts an interview and moves to in_progress', async () => {
    mockStartInterview.mockResolvedValue({
      answeredFields: {},
      completenessScore: 10,
      creditsCharged: 5,
      currentQuestion: QUESTION,
      interviewId: 'interview-2',
      progress: PROGRESS,
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [],
    });

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startInterview();
    });

    expect(mockStartInterview).toHaveBeenCalledWith('brand-1', {
      signal: expect.any(AbortSignal),
    });
    expect(result.current.status).toBe('in_progress');
    expect(result.current.interviewId).toBe('interview-2');
    expect(result.current.progress).toEqual(PROGRESS);
  });

  it('marks the interview complete when start returns completed', async () => {
    mockStartInterview.mockResolvedValue({
      answeredFields: {},
      completenessScore: 100,
      creditsCharged: 0,
      currentQuestion: null,
      interviewId: 'interview-3',
      progress: PROGRESS,
      status: BrandInterviewStatus.COMPLETED,
      steps: [],
    });

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startInterview();
    });

    expect(result.current.status).toBe('complete');
  });

  it('does not start without a brand id', async () => {
    const { result } = renderHook(() => useBrandInterview(undefined));

    await act(async () => {
      await result.current.startInterview();
    });

    expect(mockStartInterview).not.toHaveBeenCalled();
  });

  it('sets an error message when starting fails', async () => {
    mockStartInterview.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startInterview();
    });

    expect(result.current.error).toBe(
      'Failed to start the interview. Please try again.',
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('submits an answer and advances the question', async () => {
    mockGetActiveInterview.mockResolvedValue({
      answeredCount: 1,
      answeredFields: {},
      completenessScore: 40,
      currentQuestion: QUESTION,
      id: 'interview-1',
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [],
      totalCount: 4,
    });
    const nextQuestion = { fieldKey: 'audience', question: 'Who is it for?' };
    mockSubmitAnswer.mockResolvedValue({
      answeredFields: { mission: 'To ship' },
      completenessScore: 55,
      interviewId: 'interview-1',
      isComplete: false,
      nextQuestion,
      progress: PROGRESS,
      steps: [],
    });

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.interviewId).toBe('interview-1');
    });

    await act(async () => {
      await result.current.submitAnswer('To ship', 'mission');
    });

    expect(mockSubmitAnswer).toHaveBeenCalledWith('interview-1', 'To ship', {
      fieldKey: 'mission',
    });
    expect(result.current.currentQuestion).toEqual(nextQuestion);
    expect(result.current.completenessScore).toBe(55);
    expect(result.current.status).toBe('in_progress');
  });

  it('ignores submissions before an interview exists', async () => {
    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.submitAnswer('answer');
    });

    expect(mockSubmitAnswer).not.toHaveBeenCalled();
  });

  it('sets an error message when submitting fails', async () => {
    mockGetActiveInterview.mockResolvedValue({
      answeredCount: 1,
      answeredFields: {},
      completenessScore: 40,
      currentQuestion: QUESTION,
      id: 'interview-1',
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [],
      totalCount: 4,
    });
    mockSubmitAnswer.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.interviewId).toBe('interview-1');
    });

    await act(async () => {
      await result.current.submitAnswer('answer');
    });

    expect(result.current.error).toBe(
      'Failed to submit your answer. Please try again.',
    );
  });

  it('skips a question and completes when done', async () => {
    mockGetActiveInterview.mockResolvedValue({
      answeredCount: 3,
      answeredFields: {},
      completenessScore: 90,
      currentQuestion: QUESTION,
      id: 'interview-1',
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [],
      totalCount: 4,
    });
    mockSkipQuestion.mockResolvedValue({
      answeredFields: {},
      completenessScore: 90,
      interviewId: 'interview-1',
      isComplete: true,
      nextQuestion: null,
      progress: PROGRESS,
      steps: [],
    });

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.interviewId).toBe('interview-1');
    });

    await act(async () => {
      await result.current.skipQuestion();
    });

    expect(mockSkipQuestion).toHaveBeenCalledWith('interview-1');
    expect(result.current.status).toBe('complete');
    expect(result.current.currentQuestion).toBeNull();
  });

  it('ignores skip before an interview exists', async () => {
    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.skipQuestion();
    });

    expect(mockSkipQuestion).not.toHaveBeenCalled();
  });

  it('sets an error message when skipping fails', async () => {
    mockGetActiveInterview.mockResolvedValue({
      answeredCount: 1,
      answeredFields: {},
      completenessScore: 40,
      currentQuestion: QUESTION,
      id: 'interview-1',
      status: BrandInterviewStatus.IN_PROGRESS,
      steps: [],
      totalCount: 4,
    });
    mockSkipQuestion.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useBrandInterview('brand-1'));

    await waitFor(() => {
      expect(result.current.interviewId).toBe('interview-1');
    });

    await act(async () => {
      await result.current.skipQuestion();
    });

    expect(result.current.error).toBe(
      'Failed to skip the question. Please try again.',
    );
  });
});
