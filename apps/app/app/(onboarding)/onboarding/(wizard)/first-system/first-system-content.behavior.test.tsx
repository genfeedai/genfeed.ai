// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FirstSystemContent from './first-system-content';

const getStatusMock = vi.fn();
const getFirstSystemMock = vi.fn();
const generateFirstSystemMock = vi.fn();
const reviewFirstSystemItemMock = vi.fn();
const completeOnboardingMock = vi.fn();
const analyticsMocks = vi.hoisted(() => ({ captureAnalyticsEvent: vi.fn() }));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: {
    EXPERT_FIRST_SYSTEM_GENERATED: 'expert_first_system_generated',
    EXPERT_FIRST_SYSTEM_ITEM_REVIEWED: 'expert_first_system_item_reviewed',
    EXPERT_ONBOARDING_STEP: 'expert_onboarding_step',
  },
  captureAnalyticsEvent: analyticsMocks.captureAnalyticsEvent,
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    currentStepIndex: 2,
    handleSkip: vi.fn(),
    handleStepComplete: vi.fn(),
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

vi.mock(
  '@app/(onboarding)/onboarding/(wizard)/_expert/use-complete-onboarding.hook',
  () => ({ useCompleteOnboarding: () => completeOnboardingMock }),
);

vi.mock('@services/content/expert-path.service', () => ({
  ExpertPathService: {
    getInstance: vi.fn(() => ({
      generateFirstSystem: generateFirstSystemMock,
      getFirstSystem: getFirstSystemMock,
      getStatus: getStatusMock,
      reviewFirstSystemItem: reviewFirstSystemItemMock,
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

function buildStatus(overrides: {
  isReady: boolean;
  missing: ('positioning' | 'corpus')[];
}) {
  return {
    brandId: 'brand-1',
    corpus: { isComplete: true, readySourceCount: 1, sourceCount: 1 },
    firstSystem: {
      readiness: {
        creditCost: 10,
        isReady: overrides.isReady,
        isUsingInterviewPlatforms: true,
        missing: overrides.missing,
        platforms: ['linkedin'],
      },
      status: 'none' as const,
    },
    isExpert: true,
    positioning: { answeredCount: 7, isComplete: true, totalCount: 7 },
    publishApproval: { isRequired: true },
  };
}

const ITEM = {
  brandId: 'brand-1',
  confidence: 0.8,
  id: 'item-1',
  planId: 'plan-1',
  platforms: ['linkedin'],
  prompt: 'Draft it',
  status: 'pending' as const,
  topic: 'Cash flow is designed',
  type: 'skill' as const,
};

describe('FirstSystemContent behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatusMock.mockResolvedValue(
      buildStatus({ isReady: true, missing: [] }),
    );
    getFirstSystemMock.mockResolvedValue(null);
    generateFirstSystemMock.mockResolvedValue({
      items: [ITEM],
      plan: { id: 'plan-1' },
      provenance: {
        connectToSchedulePlatforms: ['linkedin'],
        corpusSourceIds: ['source-1'],
        harnessProfileId: 'profile-1',
        knowledgeReceipts: [],
        source: 'expert-first-system',
      },
    });
    reviewFirstSystemItemMock.mockResolvedValue({
      ...ITEM,
      status: 'completed',
    });
  });

  it('shows the credit cost, generates the plan, and lists reviewable items', async () => {
    render(<FirstSystemContent />);

    expect(
      await screen.findByText('Generating uses 10 credits.'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate my first system' }),
    );

    expect(await screen.findByText(ITEM.topic)).toBeInTheDocument();
    expect(
      screen.getByText('Connect linkedin to schedule'),
    ).toBeInTheDocument();
    expect(analyticsMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'expert_first_system_generated',
      { isUsingInterviewPlatforms: true, itemCount: 1, outcome: 'success' },
    );
  });

  it('routes an approved item into the review queue', async () => {
    getFirstSystemMock.mockResolvedValue({
      items: [ITEM],
      plan: { id: 'plan-1' },
      provenance: {
        connectToSchedulePlatforms: [],
        corpusSourceIds: ['source-1'],
        knowledgeReceipts: [],
        source: 'expert-first-system',
      },
    });

    render(<FirstSystemContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(reviewFirstSystemItemMock).toHaveBeenCalledWith(
        'brand-1',
        'plan-1',
        'item-1',
        { action: 'approve' },
      ),
    );
    expect(await screen.findByText('In review queue')).toBeInTheDocument();
  });

  it('keeps onboarding completable when generation fails', async () => {
    generateFirstSystemMock.mockRejectedValue(new Error('planner down'));

    render(<FirstSystemContent />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Generate my first system' }),
    );

    expect(
      await screen.findByText(/retry from your workspace tasks/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Enter workspace/ }));
    await waitFor(() => expect(completeOnboardingMock).toHaveBeenCalled());
  });

  it('links back to the steps that are still missing', async () => {
    getStatusMock.mockResolvedValue(
      buildStatus({ isReady: false, missing: ['positioning', 'corpus'] }),
    );

    render(<FirstSystemContent />);

    expect(
      await screen.findByRole('link', {
        name: 'Finish your positioning interview',
      }),
    ).toHaveAttribute('href', '/onboarding/positioning');
    expect(
      screen.getByRole('link', {
        name: 'Add at least one ready corpus source',
      }),
    ).toHaveAttribute('href', '/onboarding/corpus');
  });
});
