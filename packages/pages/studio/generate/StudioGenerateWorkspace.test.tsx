import type { BrandRemixRunView } from '@api-types/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTypeSettings: vi.fn(),
  isHydrated: { value: false },
  refresh: vi.fn(),
  resetSettings: vi.fn(),
  run: { value: null as unknown },
  setType: vi.fn(),
  start: vi.fn(),
  submit: vi.fn(),
  submitForReview: vi.fn(),
  type: { value: 'image' },
  updateSettings: vi.fn(),
  vary: vi.fn(),
}));

const run = {
  brand: { contextMode: 'brand', id: 'brand-1', name: 'Northstar' },
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Remix the proof-led TikTok hook.' },
    output: {
      aspectRatio: '9:16',
      count: 3,
      durationSeconds: 8,
      kind: 'video',
    },
    references: [
      { assetId: 'reference-1', role: 'style', source: 'brand_default' },
    ],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'tiktok' },
  },
  id: 'run-1',
  phase: 'prefilled',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    pattern: { hook: 'Proof before promise' },
    title: 'Proof-led TikTok hook',
  },
} as BrandRemixRunView;

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({ hasCanonicalBreadcrumb: true }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/default/default/studio/generate',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateSettings', () => ({
  useStudioGenerateSettings: () => ({
    applyTypeSettings: mocks.applyTypeSettings,
    isHydrated: mocks.isHydrated.value,
    resetSettings: mocks.resetSettings,
    settings: {
      aspectRatio: '9:16',
      duration: 12,
      outputs: 2,
    },
    setType: mocks.setType,
    type: mocks.type.value,
    updateSettings: mocks.updateSettings,
  }),
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateModels', () => ({
  useStudioGenerateModels: () => ({ isLoadingModels: false, models: [] }),
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateGallery', () => ({
  useStudioGenerateGallery: () => ({
    isLoadingGallery: false,
    refresh: mocks.refresh,
    storedJobs: [],
  }),
}));

vi.mock('@pages/studio/generate/hooks/useStudioGeneration', () => ({
  useStudioGeneration: () => ({
    isGenerating: false,
    jobs: [],
    submit: mocks.submit,
  }),
}));

vi.mock('@pages/studio/generate/hooks/useStudioRemixRun', () => ({
  useStudioRemixRun: () => ({
    error: null,
    preparePausedDraft: vi.fn(),
    refresh: vi.fn(),
    run: mocks.run.value,
    runId: 'run-1',
    start: mocks.start,
    status: 'ready',
    submitForReview: mocks.submitForReview,
    vary: mocks.vary,
  }),
}));

vi.mock('@pages/studio/generate/components/StudioGenerateComposer', () => ({
  default: ({ onSubmit, prompt }: { onSubmit: () => void; prompt: string }) => (
    <div>
      <span>{prompt || 'Empty composer'}</span>
      <button type="button" onClick={onSubmit}>
        Generate
      </button>
    </div>
  ),
}));

vi.mock('@pages/studio/generate/components/StudioGenerateResults', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div>{children ?? 'Generation results'}</div>
  ),
}));

vi.mock('@pages/studio/generate/components/StudioRemixRunPanel', () => ({
  default: ({ run: currentRun }: { run: BrandRemixRunView }) => (
    <div>{currentRun.sourceSnapshot.title}</div>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import StudioGenerateWorkspace from './StudioGenerateWorkspace';

describe('StudioGenerateWorkspace remix restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isHydrated.value = false;
    mocks.run.value = run;
    mocks.type.value = 'image';
  });

  it('applies the server recipe only after local settings hydration', async () => {
    const { rerender } = render(<StudioGenerateWorkspace />);

    expect(mocks.setType).not.toHaveBeenCalled();
    expect(screen.getByText('Empty composer')).toBeVisible();

    mocks.isHydrated.value = true;
    rerender(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(mocks.applyTypeSettings).toHaveBeenCalledWith(
        'video',
        expect.objectContaining({
          aspectRatio: '9:16',
          duration: 8,
          outputs: 3,
        }),
      ),
    );
    expect(screen.getByText('Remix the proof-led TikTok hook.')).toBeVisible();
  });

  it('starts the durable run instead of bypassing lineage through generic generation', async () => {
    mocks.isHydrated.value = true;
    mocks.type.value = 'video';
    render(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(
        screen.getByText('Remix the proof-led TikTok hook.'),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          objective: 'Remix the proof-led TikTok hook.',
        }),
        references: [],
      }),
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('never falls through to generic generation for an unsupported active remix type', async () => {
    mocks.isHydrated.value = true;
    mocks.type.value = 'music';
    render(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(
        screen.getByText('Remix the proof-led TikTok hook.'),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('restores and starts an avatar remix without translating or dropping its durable identity', async () => {
    mocks.isHydrated.value = true;
    mocks.run.value = {
      ...run,
      draft: {
        ...run.draft,
        identity: {
          avatarAssetId: 'avatar-row-1',
          speechVoiceId: 'voice-row-1',
        },
        output: {
          aspectRatio: '9:16',
          count: 2,
          durationSeconds: 12,
          kind: 'avatar',
        },
      },
    };
    const { rerender } = render(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(mocks.applyTypeSettings).toHaveBeenCalledWith(
        'avatar',
        expect.not.objectContaining({
          avatarPhotoUrl: expect.anything(),
          voiceId: expect.anything(),
        }),
      ),
    );

    mocks.type.value = 'avatar';
    rerender(<StudioGenerateWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: {
          avatarAssetId: 'avatar-row-1',
          speechVoiceId: 'voice-row-1',
        },
        output: expect.objectContaining({ kind: 'avatar' }),
      }),
    );
  });
  it('uses the shared section topbar for filters and search', () => {
    render(<StudioGenerateWorkspace />);

    const topbar = screen.getByTestId('section-topbar');
    expect(topbar).toContainElement(
      screen.getByRole('button', { name: 'All' }),
    );
    expect(topbar).toContainElement(
      screen.getByRole('button', { name: 'Image' }),
    );
    expect(topbar).toContainElement(
      screen.getByPlaceholderText('Search generations'),
    );
  });

  it('uses the same composer track as the Agent surface', () => {
    render(<StudioGenerateWorkspace />);

    const container = screen
      .getByTestId('studio-composer')
      .closest('[data-layout-mode]');

    expect(container).toHaveAttribute('data-layout-mode', 'inflow');
    expect(container).toHaveAttribute('data-max-width', '4xl');
    expect(container).toContainElement(
      document.querySelector('[data-composer-top-fade]'),
    );
  });
});
