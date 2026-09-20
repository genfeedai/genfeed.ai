// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CorpusContent from './corpus-content';

const handleStepCompleteMock = vi.fn();
const handleSkipMock = vi.fn();
const findForBrandMock = vi.fn();
const findVersionsMock = vi.fn();
const captureMock = vi.fn();
const uploadMock = vi.fn();
const retryMock = vi.fn();
const analyticsMocks = vi.hoisted(() => ({ captureAnalyticsEvent: vi.fn() }));

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: { EXPERT_ONBOARDING_STEP: 'expert_onboarding_step' },
  captureAnalyticsEvent: analyticsMocks.captureAnalyticsEvent,
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    currentStepIndex: 2,
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

vi.mock('@services/content/knowledge-sources.service', () => ({
  KnowledgeSourcesService: {
    getInstance: vi.fn(() => ({
      capture: captureMock,
      findForBrand: findForBrandMock,
      findVersions: findVersionsMock,
      retry: retryMock,
      upload: uploadMock,
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

vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/settings/knowledge/knowledge-state-badge',
  () => ({
    default: ({ version }: { version?: { processingState?: string } }) => (
      <span data-testid="state-badge">
        {version?.processingState ?? 'none'}
      </span>
    ),
  }),
);

describe('CorpusContent behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findForBrandMock.mockResolvedValue([]);
    findVersionsMock.mockResolvedValue([]);
    captureMock.mockResolvedValue({ source: { id: 'source-1' } });
    uploadMock.mockResolvedValue({ source: { id: 'source-2' } });
    retryMock.mockResolvedValue({ version: { id: 'version-2' } });
  });

  it('captures a URL as authoritative brand knowledge with a stable idempotency key', async () => {
    render(<CorpusContent />);

    fireEvent.change(await screen.findByLabelText('Public URL'), {
      target: { value: 'yoursite.com/talk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to corpus' }));

    await waitFor(() => expect(captureMock).toHaveBeenCalled());
    const [body, brandId, idempotencyKey] = captureMock.mock.calls[0];
    expect(body).toMatchObject({
      kind: 'URL',
      purpose: 'BRAND_TRUTH',
      referenceUrl: 'https://yoursite.com/talk',
      scope: 'brand',
    });
    expect(brandId).toBe('brand-1');
    expect(idempotencyKey).toMatch(/^expert-corpus-brand-1-/);
  });

  it('blocks Continue until a source is ready and allows skipping', async () => {
    findForBrandMock.mockResolvedValue([
      { id: 'source-1', purpose: 'BRAND_TRUTH', title: 'Keynote' },
    ]);
    findVersionsMock.mockResolvedValue([
      { id: 'version-1', isCurrent: true, processingState: 'QUEUED' },
    ]);

    render(<CorpusContent />);

    await screen.findByText('Keynote');
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(handleSkipMock).toHaveBeenCalledWith('corpus'));
    expect(analyticsMocks.captureAnalyticsEvent).toHaveBeenCalledWith(
      'expert_onboarding_step',
      { action: 'skipped', step: 'corpus' },
    );
  });

  it('continues once a source is ready', async () => {
    findForBrandMock.mockResolvedValue([
      { id: 'source-1', purpose: 'BRAND_TRUTH', title: 'Newsletter' },
    ]);
    findVersionsMock.mockResolvedValue([
      { id: 'version-1', isCurrent: true, processingState: 'READY' },
    ]);

    render(<CorpusContent />);

    const continueButton = await screen.findByRole('button', {
      name: /Continue/,
    });
    await waitFor(() => expect(continueButton).not.toBeDisabled());

    fireEvent.click(continueButton);
    await waitFor(() =>
      expect(handleStepCompleteMock).toHaveBeenCalledWith('corpus'),
    );
  });

  it('retries a failed source without creating a duplicate', async () => {
    findForBrandMock.mockResolvedValue([
      { id: 'source-1', purpose: 'BRAND_TRUTH', title: 'Call notes' },
    ]);
    findVersionsMock.mockResolvedValue([
      { id: 'version-1', isCurrent: true, processingState: 'FAILED' },
    ]);

    render(<CorpusContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(retryMock).toHaveBeenCalledWith('source-1', 'brand-1'),
    );
    expect(captureMock).not.toHaveBeenCalled();
  });
});
