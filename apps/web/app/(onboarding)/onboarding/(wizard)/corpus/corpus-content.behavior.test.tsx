// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CorpusContent from './corpus-content';

type StoredSource = {
  body: Record<string, unknown>;
  brandId: string;
  id: string;
  idempotencyKey: string;
  purpose: string;
  title: string;
};
type StoredVersion = {
  id: string;
  isCurrent: boolean;
  processingState: string;
};

/**
 * In-memory knowledge-sources API (idempotent capture, retry adds a new
 * current version), plus what the onboarding wizard and analytics received.
 */
const world = vi.hoisted(() => ({
  analytics: [] as { event: string; properties: unknown }[],
  completedSteps: [] as string[],
  skippedSteps: [] as string[],
  sources: [] as StoredSource[],
  versions: {} as Record<string, StoredVersion[]>,
}));

function seedSource(title: string, processingState: string): void {
  world.sources.push({
    body: {},
    brandId: 'brand-1',
    id: 'source-1',
    idempotencyKey: 'seed',
    purpose: 'BRAND_TRUTH',
    title,
  });
  world.versions['source-1'] = [
    { id: 'version-1', isCurrent: true, processingState },
  ];
}

vi.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: { EXPERT_ONBOARDING_STEP: 'expert_onboarding_step' },
  captureAnalyticsEvent: (event: string, properties: unknown) => {
    world.analytics.push({ event, properties });
  },
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    currentStepIndex: 2,
    handleSkip: async (step: string) => {
      world.skippedSteps.push(step);
    },
    handleStepComplete: async (step: string) => {
      world.completedSteps.push(step);
    },
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
    getInstance: () => ({
      capture: async (
        body: Record<string, unknown>,
        brandId: string,
        idempotencyKey: string,
      ) => {
        const existing = world.sources.find(
          (source) => source.idempotencyKey === idempotencyKey,
        );
        if (existing) return { source: existing };
        const source: StoredSource = {
          body,
          brandId,
          id: `source-${world.sources.length + 1}`,
          idempotencyKey,
          purpose: String(body.purpose),
          title: String(body.title),
        };
        world.sources.push(source);
        world.versions[source.id] = [
          { id: `${source.id}-v1`, isCurrent: true, processingState: 'QUEUED' },
        ];
        return { source };
      },
      findForBrand: async ({ brandId }: { brandId: string }) =>
        world.sources.filter((source) => source.brandId === brandId),
      findVersions: async (sourceId: string) => world.versions[sourceId] ?? [],
      retry: async (sourceId: string) => {
        const versions = world.versions[sourceId] ?? [];
        const version = {
          id: `version-${versions.length + 1}`,
          isCurrent: true,
          processingState: 'QUEUED',
        };
        world.versions[sourceId] = [
          ...versions.map((item) => ({ ...item, isCurrent: false })),
          version,
        ];
        return { version };
      },
      upload: async () => {
        throw new Error('upload not used in these tests');
      },
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: () => undefined },
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
    world.analytics = [];
    world.completedSteps = [];
    world.skippedSteps = [];
    world.sources = [];
    world.versions = {};
  });

  it('captures a URL as authoritative brand knowledge with a stable idempotency key', async () => {
    render(<CorpusContent />);

    fireEvent.change(await screen.findByLabelText('Public URL'), {
      target: { value: 'yoursite.com/talk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to corpus' }));

    expect(
      await screen.findByText('https://yoursite.com/talk'),
    ).toBeInTheDocument();
    expect(world.sources).toEqual([
      expect.objectContaining({
        body: expect.objectContaining({
          kind: 'URL',
          purpose: 'BRAND_TRUTH',
          referenceUrl: 'https://yoursite.com/talk',
          scope: 'brand',
        }),
        brandId: 'brand-1',
        idempotencyKey: expect.stringMatching(/^expert-corpus-brand-1-/),
      }),
    ]);

    fireEvent.change(screen.getByLabelText('Public URL'), {
      target: { value: 'https://yoursite.com/talk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to corpus' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Public URL')).toHaveValue(''),
    );
    expect(world.sources).toHaveLength(1);
  });

  it('blocks Continue until a source is ready and allows skipping', async () => {
    seedSource('Keynote', 'QUEUED');

    render(<CorpusContent />);

    await screen.findByText('Keynote');
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(world.skippedSteps).toEqual(['corpus']));
    expect(world.completedSteps).toEqual([]);
    expect(world.analytics).toContainEqual({
      event: 'expert_onboarding_step',
      properties: { action: 'skipped', step: 'corpus' },
    });
  });

  it('continues once a source is ready', async () => {
    seedSource('Newsletter', 'READY');

    render(<CorpusContent />);

    const continueButton = await screen.findByRole('button', {
      name: /Continue/,
    });
    await waitFor(() => expect(continueButton).not.toBeDisabled());

    fireEvent.click(continueButton);
    await waitFor(() => expect(world.completedSteps).toEqual(['corpus']));
  });

  it('retries a failed source without creating a duplicate', async () => {
    seedSource('Call notes', 'FAILED');

    render(<CorpusContent />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('QUEUED')).toBeInTheDocument();
    expect(world.sources).toHaveLength(1);
    expect(world.versions['source-1']).toEqual([
      expect.objectContaining({ isCurrent: false, processingState: 'FAILED' }),
      expect.objectContaining({ isCurrent: true, processingState: 'QUEUED' }),
    ]);
  });
});
