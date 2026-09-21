// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PositioningContent from './positioning-content';

const handleStepCompleteMock = vi.fn();
const handleSkipMock = vi.fn();
const getStatusMock = vi.fn();
const getActiveInterviewMock = vi.fn();
const startInterviewMock = vi.fn();
const submitAnswerMock = vi.fn();
const skipQuestionMock = vi.fn();
const completeInterviewMock = vi.fn();
const analyticsMocks = vi.hoisted(() => ({ captureAnalyticsEvent: vi.fn() }));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: { EXPERT_ONBOARDING_STEP: 'expert_onboarding_step' },
  captureAnalyticsEvent: analyticsMocks.captureAnalyticsEvent,
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    currentStepIndex: 1,
    handleSkip: handleSkipMock,
    handleStepComplete: handleStepCompleteMock,
    saving: false,
    steps: ['brand', 'positioning', 'corpus'],
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: { id: 'brand-1' } }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const cache = new Map<unknown, () => Promise<unknown>>();
  return {
    useAuthedService: (factory: (token: string) => unknown) => {
      const existing = cache.get(factory.toString());
      if (existing) {
        return existing;
      }
      const resolve = async () => factory('api-token');
      cache.set(factory.toString(), resolve);
      return resolve;
    },
  };
});

vi.mock('@services/content/expert-path.service', () => ({
  ExpertPathService: {
    getInstance: vi.fn(() => ({ getStatus: getStatusMock })),
  },
}));

vi.mock('@services/social/brand-interview.service', () => ({
  BrandInterviewService: {
    getInstance: vi.fn(() => ({
      completeInterview: completeInterviewMock,
      getActiveInterview: getActiveInterviewMock,
      skipQuestion: skipQuestionMock,
      startInterview: startInterviewMock,
      submitAnswer: submitAnswerMock,
    })),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const ORIGIN_QUESTION = {
  answerType: 'text' as const,
  fieldKey: 'originStory',
  group: 'expert' as const,
  isRequired: true,
  questionText: 'What is your origin story?',
  weight: 10,
};

const DOMINO_QUESTION = {
  ...ORIGIN_QUESTION,
  fieldKey: 'bigDomino',
  questionText: 'What is the one belief?',
};

const SCORE = {
  dimensions: [
    {
      followUpFieldKey: 'bigDomino',
      followUpQuestion: 'Finish this sentence: if they believed ___',
      key: 'bigDomino' as const,
      label: 'Big Domino',
      maxWeightedScore: 20,
      score: 3,
      weight: 2,
      weightedScore: 6,
    },
  ],
  rating: 'needs_work' as const,
  scoredAt: '2026-09-19T00:00:00.000Z',
  totalScore: 58,
  version: 1 as const,
  weakestDimension: 'bigDomino' as const,
};

function emptyStatus() {
  return {
    brandId: 'brand-1',
    corpus: { isComplete: false, readySourceCount: 0, sourceCount: 0 },
    firstSystem: {
      readiness: {
        creditCost: 10,
        isReady: false,
        isUsingInterviewPlatforms: true,
        missing: ['positioning', 'corpus'],
        platforms: [],
      },
      status: 'none' as const,
    },
    isExpert: true,
    positioning: { answeredCount: 0, isComplete: false, totalCount: 7 },
    publishApproval: { isRequired: true },
  };
}

describe('PositioningContent behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatusMock.mockResolvedValue(emptyStatus());
    getActiveInterviewMock.mockResolvedValue(null);
    startInterviewMock.mockResolvedValue({
      currentQuestion: ORIGIN_QUESTION,
      interviewId: 'interview-1',
      isExpertPositioning: true,
      steps: [
        { fieldKey: 'originStory', group: 'expert' },
        { fieldKey: 'bigDomino', group: 'expert' },
      ],
    });
  });

  it('starts the expert interview and advances to the next positioning question', async () => {
    submitAnswerMock.mockResolvedValue({
      isComplete: false,
      nextQuestion: DOMINO_QUESTION,
      steps: [],
    });

    render(<PositioningContent />);

    await screen.findByText(ORIGIN_QUESTION.questionText);
    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'I used to run finance at a startup.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));

    await waitFor(() =>
      expect(submitAnswerMock).toHaveBeenCalledWith(
        'interview-1',
        'I used to run finance at a startup.',
      ),
    );
    expect(
      await screen.findByText(DOMINO_QUESTION.questionText),
    ).toBeInTheDocument();
  });

  it('scores the positioning and surfaces the weakest dimension', async () => {
    submitAnswerMock.mockResolvedValue({
      isComplete: false,
      nextQuestion: null,
      steps: [],
    });
    completeInterviewMock.mockResolvedValue({
      isComplete: true,
      nextQuestion: null,
      positioningScore: SCORE,
      steps: [],
    });

    render(<PositioningContent />);
    await screen.findByText(ORIGIN_QUESTION.questionText);
    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'A story.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Score my positioning' }),
    );

    expect(await screen.findByText('58 / 100')).toBeInTheDocument();
    expect(
      screen.getByText('Weakest dimension: Big Domino'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(SCORE.dimensions[0].followUpQuestion),
    ).toBeInTheDocument();
  });

  it('renders an existing score without starting a new interview', async () => {
    const status = emptyStatus();
    getStatusMock.mockResolvedValue({
      ...status,
      positioning: {
        answeredCount: 7,
        harnessProfileId: 'profile-1',
        isComplete: true,
        score: SCORE,
        totalCount: 7,
      },
    });

    render(<PositioningContent />);

    expect(await screen.findByText('58 / 100')).toBeInTheDocument();
    expect(startInterviewMock).not.toHaveBeenCalled();
  });

  it('records a skipped step so it resurfaces as a workspace task', async () => {
    render(<PositioningContent />);
    await screen.findByText(ORIGIN_QUESTION.questionText);

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() =>
      expect(handleSkipMock).toHaveBeenCalledWith('positioning'),
    );
    expect(analyticsMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'expert_onboarding_step',
      { action: 'skipped', step: 'positioning' },
    );
  });
});
