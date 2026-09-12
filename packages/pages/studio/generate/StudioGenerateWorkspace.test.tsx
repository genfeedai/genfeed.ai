import type { BrandRemixRunView } from '@genfeedai/contracts/api-types/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useCallback, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioGenerateWorkspace from './StudioGenerateWorkspace';

const mocks = vi.hoisted(() => ({
  assetActions: {
    onClickIngredient: vi.fn(),
    onConvertToVideo: vi.fn(),
    onCopyPrompt: vi.fn(),
    onCreateVariation: vi.fn(),
    onDeleteIngredient: vi.fn(),
    onMarkArchived: vi.fn(),
    onMarkRejected: vi.fn(),
    onMarkValidated: vi.fn(),
    onPublishIngredient: vi.fn(),
    onRefresh: vi.fn(),
    onRemoveGeneration: vi.fn(),
    onSeeDetails: vi.fn(),
    onToggleFavorite: vi.fn(),
    onUseAsVideoReference: vi.fn(),
  },
  assetActionsHook: vi.fn(),
  attachments: vi.fn(),
  applyTypeSettings: vi.fn(),
  composer: vi.fn(),
  findByIds: vi.fn().mockResolvedValue([]),
  gallery: vi.fn(),
  // #4716 review — the Agent -> Studio handoff pipeline (apply, model
  // validation/fallback, param validation, reference attachment, brand
  // guard) has no other workspace-level coverage; only pure utils and the
  // mocked hook were tested, which is exactly why the wiring gaps survived.
  handoff: {
    value: { isLoading: false, payload: null } as {
      isLoading: boolean;
      payload: Record<string, unknown> | null;
    },
  },
  models: {
    value: { isLoadingModels: false, models: [] as { key: string }[] },
  },
  notify: vi.fn(),
  results: vi.fn(),
  rehydratePending: vi.fn(),
  removeJob: vi.fn(),
  remixRun: { value: null as BrandRemixRunView | null },
  settings: vi.fn(),
  submit: vi.fn(),
  submitForReview: vi.fn(),
  startRemix: vi.fn(),
  type: { value: 'image' },
  isHydrated: { value: true },
  setType: vi.fn(),
  updateSettings: vi.fn(),
  vary: vi.fn(),
}));

const remixRun = {
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

const characterMentionMocks = vi.hoisted(() => ({
  extraExtensions: [{ name: 'characterMention' }],
  resolveSubmit: vi.fn(
    ({
      existingReferenceIds,
      text,
    }: {
      existingReferenceIds: string[];
      text: string;
    }) => ({
      notices: [],
      referenceIds: [...existingReferenceIds, 'img-anna'],
      text: text.replace('@anna', 'Anna'),
    }),
  ),
}));

vi.mock('@genfeedai/agent', () => ({
  useAgentApiService: () => null,
}));

vi.mock('@genfeedai/agent/hooks/use-studio-character-mentions', () => ({
  useStudioCharacterMentions: () => ({
    extraExtensions: characterMentionMocks.extraExtensions,
    isLoading: false,
    mentions: [],
    resolveSubmit: characterMentionMocks.resolveSubmit,
  }),
}));

vi.mock('@genfeedai/agent/hooks/use-content-mentions', () => ({
  useContentMentions: () => ({ isLoading: false, mentions: [] }),
}));

vi.mock('@genfeedai/agent/hooks/use-microphone-input', () => ({
  useMicrophoneInput: () => ({
    isListening: false,
    isSupported: true,
    isTranscribing: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));

vi.mock('@hooks/ui/use-attachments/use-attachments', () => ({
  useAttachments: mocks.attachments,
}));

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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'title'
      ? 'Generate'
      : key === 'description'
        ? 'One prompt bar for every asset type, enriched with your brand.'
        : key,
}));

vi.mock('@pages/studio/generate/components/StudioGenerateComposer', () => ({
  default: (props: {
    onResetSettings: () => void;
    onSubmit: () => void;
    prompt: string;
  }) => {
    mocks.composer(props);
    return (
      <div data-testid="studio-composer">
        <span>{props.prompt || 'Empty composer'}</span>
        <button type="button" onClick={props.onSubmit}>
          Generate
        </button>
        <button type="button" onClick={props.onResetSettings}>
          Reset
        </button>
      </div>
    );
  },
}));

vi.mock('@pages/studio/generate/components/StudioGenerateResults', () => ({
  default: (props: unknown) => {
    mocks.results(props);
    return <div data-testid="studio-results" />;
  },
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateAssetActions', () => ({
  useStudioGenerateAssetActions: (params: unknown) => {
    mocks.assetActionsHook(params);
    return mocks.assetActions;
  },
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateGallery', () => ({
  useStudioGenerateGallery: mocks.gallery,
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateModels', () => ({
  useStudioGenerateModels: () => mocks.models.value,
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateHandoff', () => ({
  useStudioGenerateHandoff: () => mocks.handoff.value,
}));

// Bypasses the real auth-identity chain so the handoff reference-resolution
// effect's `getIngredientsService()` resolves deterministically in this
// unit test environment (mirrors the same mock in useStudioGenerateHandoff.test.ts).
// Bypasses the real auth-identity chain so the handoff reference-resolution
// effect's `getIngredientsService()` resolves deterministically in this unit
// test environment. Mirrors the real hook's stability contract (a
// `useCallback`-stable resolver independent of the caller's inline factory
// identity) — an unstable mock resolver re-fires the consuming effect on
// every render and cancels itself before the async call ever resolves.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const factoryRef = useRef(factory);
    factoryRef.current = factory;
    return useCallback(async () => factoryRef.current('test-token'), []);
  },
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({ findByIds: mocks.findByIds }),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      info: mocks.notify,
      success: vi.fn(),
      warning: vi.fn(),
    }),
  },
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateSettings', () => ({
  useStudioGenerateSettings: () => {
    const legacy = mocks.settings();
    return {
      ...legacy,
      applyTypeSettings: mocks.applyTypeSettings,
      isHydrated: mocks.isHydrated.value,
      settings: {
        ...legacy.settings,
        aspectRatio: '9:16',
        duration: 12,
        outputs: 2,
      },
      setType: mocks.setType,
      type: mocks.type.value,
      updateSettings: mocks.updateSettings,
    };
  },
}));

vi.mock('@pages/studio/generate/hooks/useStudioGeneration', () => ({
  useStudioGeneration: () => ({
    isGenerating: false,
    jobs: [],
    rehydratePending: mocks.rehydratePending,
    removeJob: mocks.removeJob,
    submit: mocks.submit,
  }),
}));

vi.mock('@pages/studio/generate/components/StudioGenerateInspector', () => ({
  default: ({
    job,
    onVary,
  }: {
    job: { id: string; prompt: string };
    onVary: (job: { id: string }) => void;
  }) => (
    <div data-testid="studio-inspector">
      <span>{job.prompt}</span>
      <button type="button" onClick={() => onVary(job)}>
        Vary
      </button>
    </div>
  ),
}));

vi.mock('@pages/studio/generate/hooks/useStudioRemixRun', () => ({
  useStudioRemixRun: () => ({
    error: null,
    preparePausedDraft: vi.fn(),
    refresh: vi.fn(),
    run: mocks.remixRun.value,
    runId: mocks.remixRun.value?.id ?? null,
    start: mocks.startRemix,
    status: 'ready',
    submitForReview: mocks.submitForReview,
    vary: mocks.vary,
  }),
}));

vi.mock('@pages/studio/generate/components/StudioRemixRunPanel', () => ({
  default: ({ run }: { run: BrandRemixRunView }) => (
    <div>{run.sourceSnapshot.title}</div>
  ),
}));

describe('StudioGenerateWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isHydrated.value = true;
    mocks.remixRun.value = null;
    mocks.type.value = 'image';
    mocks.handoff.value = { isLoading: false, payload: null };
    mocks.models.value = { isLoadingModels: false, models: [] };
    mocks.findByIds.mockResolvedValue([]);
    mocks.attachments.mockReturnValue({
      addFiles: vi.fn(),
      attachments: [],
      dragHandlers: {},
      dragState: { isActive: false },
      getCompletedAttachments: () => [
        {
          ingredientId: 'ingredient-1',
          kind: 'image',
          url: 'https://cdn.example/reference.png',
        },
      ],
      isUploading: false,
      removeAttachment: vi.fn(),
    });
    mocks.gallery.mockReturnValue({
      isLoadingGallery: false,
      refresh: vi.fn(),
      storedJobs: [],
    });
    mocks.settings.mockReturnValue({
      resetSettings: vi.fn(),
      settings: {},
      setType: mocks.setType,
      type: 'image',
      updateSettings: vi.fn(),
    });
  });

  it('removes gallery tabs without hiding history from other asset types', () => {
    render(<StudioGenerateWorkspace />);

    const topbar = screen.getByTestId('section-topbar');
    expect(topbar).toContainElement(
      screen.getByPlaceholderText('Search generations'),
    );
    expect(screen.queryByTestId('section-topbar-tabs')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(mocks.gallery).toHaveBeenCalledWith({
      brandId: 'brand-1',
      filter: 'all',
    });
    expect(screen.getByTestId('studio-results')).not.toContainElement(
      screen.getByPlaceholderText('Search generations'),
    );
  });

  it('removes a deleted asset from the current-session job queue', () => {
    render(<StudioGenerateWorkspace />);

    expect(mocks.assetActionsHook).toHaveBeenCalledWith(
      expect.objectContaining({ onDeleted: mocks.removeJob }),
    );
  });

  it('floats the composer over the gallery like the Agent dock', () => {
    render(<StudioGenerateWorkspace />);

    const container = screen
      .getByTestId('studio-composer')
      .closest('[data-layout-mode]');

    expect(container).toHaveAttribute('data-layout-mode', 'surface-fixed');
    expect(container).toHaveAttribute('data-max-width', '4xl');
    expect(container).not.toHaveClass('bg-background');
    expect(container).toContainElement(
      document.querySelector('[data-composer-top-fade]'),
    );
  });

  it('submits completed Agent-style attachments as generation references', () => {
    render(<StudioGenerateWorkspace />);

    const initialProps = mocks.composer.mock.calls.at(-1)?.[0] as {
      extraExtensions?: unknown;
      onPromptChange: (value: string) => void;
    };
    expect(initialProps.extraExtensions).toBe(
      characterMentionMocks.extraExtensions,
    );
    act(() => initialProps.onPromptChange('Use this composition'));

    const currentProps = mocks.composer.mock.calls.at(-1)?.[0] as {
      onSubmit: () => void;
    };
    act(() => currentProps.onSubmit());

    expect(characterMentionMocks.resolveSubmit).toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledWith('Use this composition', {
      endFrameId: undefined,
      imageReferenceIds: ['ingredient-1', 'img-anna'],
      videoReferenceIds: [],
    });
  });

  it('serializes character mention display names and merges reference ids on generate', () => {
    render(<StudioGenerateWorkspace />);

    const initialProps = mocks.composer.mock.calls.at(-1)?.[0] as {
      onPromptChange: (value: string) => void;
    };
    act(() => initialProps.onPromptChange('@anna walking'));

    const currentProps = mocks.composer.mock.calls.at(-1)?.[0] as {
      onSubmit: () => void;
    };
    act(() => currentProps.onSubmit());

    expect(mocks.submit).toHaveBeenCalledWith('Anna walking', {
      endFrameId: undefined,
      imageReferenceIds: ['ingredient-1', 'img-anna'],
      videoReferenceIds: [],
    });
  });

  it('turns a gallery remix into a composer reference', () => {
    render(<StudioGenerateWorkspace />);

    const hookParams = mocks.assetActionsHook.mock.calls.at(-1)?.[0] as {
      onAttachReference: (
        ingredient: {
          category: string;
          id: string;
          promptText: string;
          thumbnailUrl: string;
        },
        type: 'image' | 'video',
      ) => void;
    };
    act(() =>
      hookParams.onAttachReference(
        {
          category: 'images',
          id: 'generated-1',
          promptText: 'A generated reference',
          thumbnailUrl: 'https://cdn.example/generated.png',
        },
        'video',
      ),
    );

    expect(
      mocks.settings.mock.results.at(-1)?.value.setType,
    ).toHaveBeenCalledWith('video');
    const composerProps = mocks.composer.mock.calls.at(-1)?.[0] as {
      attachedAssets: Array<{ id: string; previewUrl?: string }>;
    };
    expect(composerProps.attachedAssets).toContainEqual(
      expect.objectContaining({
        id: 'generated-1',
        previewUrl: 'https://cdn.example/generated.png',
      }),
    );
  });

  it('hydrates the durable server recipe before starting its run', async () => {
    mocks.isHydrated.value = false;
    mocks.remixRun.value = remixRun;
    const { rerender } = render(<StudioGenerateWorkspace />);

    expect(mocks.applyTypeSettings).not.toHaveBeenCalled();
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

  it('resets remix settings to the authorized run draft instead of generic defaults', async () => {
    const resetSettings = vi.fn();
    mocks.remixRun.value = remixRun;
    mocks.type.value = 'video';
    mocks.settings.mockReturnValue({
      resetSettings,
      settings: {},
      setType: mocks.setType,
      type: 'video',
      updateSettings: vi.fn(),
    });
    render(<StudioGenerateWorkspace />);

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
    mocks.applyTypeSettings.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(resetSettings).not.toHaveBeenCalled();
    expect(mocks.applyTypeSettings).toHaveBeenCalledWith(
      'video',
      expect.objectContaining({
        aspectRatio: '9:16',
        duration: 8,
        outputs: 3,
      }),
    );
  });

  it('starts the durable run without falling through to generic generation', async () => {
    mocks.remixRun.value = remixRun;
    mocks.type.value = 'video';
    render(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(
        screen.getByText('Remix the proof-led TikTok hook.'),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mocks.startRemix).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          objective: 'Remix the proof-led TikTok hook.',
        }),
        references: [],
      }),
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('does not bypass an active remix with an unsupported generic type', async () => {
    mocks.remixRun.value = remixRun;
    mocks.type.value = 'music';
    render(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(
        screen.getByText('Remix the proof-led TikTok hook.'),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mocks.startRemix).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('hydrates grouped copy count without translating the run into media', async () => {
    mocks.remixRun.value = {
      ...remixRun,
      draft: {
        ...remixRun.draft,
        output: { count: 4, kind: 'copy' },
      },
    };
    render(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith({ outputs: 4 }),
    );
    expect(mocks.applyTypeSettings).not.toHaveBeenCalled();
  });

  it('preserves the durable avatar and voice identities during restoration', async () => {
    mocks.remixRun.value = {
      ...remixRun,
      draft: {
        ...remixRun.draft,
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
    mocks.type.value = 'avatar';
    render(<StudioGenerateWorkspace />);

    await waitFor(() =>
      expect(mocks.applyTypeSettings).toHaveBeenCalledWith(
        'avatar',
        expect.not.objectContaining({
          avatarPhotoUrl: expect.anything(),
          voiceId: expect.anything(),
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mocks.startRemix).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: {
          avatarAssetId: 'avatar-row-1',
          speechVoiceId: 'voice-row-1',
        },
        output: expect.objectContaining({ kind: 'avatar' }),
      }),
    );
  });

  it('resubscribes stored in-flight jobs when the playground remounts', () => {
    const storedJobs = [
      {
        createdAt: 1,
        id: 'processing-1',
        prompt: 'Still rendering',
        status: 'PROCESSING',
        type: 'image',
      },
    ];
    mocks.gallery.mockReturnValue({
      isLoadingGallery: false,
      refresh: vi.fn(),
      storedJobs,
    });

    render(<StudioGenerateWorkspace />);

    expect(mocks.rehydratePending).toHaveBeenCalledWith(storedJobs);
  });

  it('defaults to the masonry grid and toggles the results into a list', () => {
    render(<StudioGenerateWorkspace />);

    expect(screen.getByTestId('studio-results').parentElement).toHaveClass(
      'w-full',
      'max-w-7xl',
    );
    expect(mocks.results.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ view: 'grid' }),
    );

    fireEvent.click(screen.getByRole('radio', { name: 'viewList' }));

    expect(mocks.results.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ view: 'list' }),
    );
  });

  it('prefills the composer from a card recipe on vary', () => {
    const recipeJob = {
      createdAt: 1,
      id: 'job-1',
      prompt: 'Raw box contents',
      recipe: {
        blacklist: [],
        brandingMode: 'brand',
        isAudioEnabled: false,
        mood: 'confident',
        outputs: 4,
        promptTemplate: 'product-photo',
        references: [],
        style: 'editorial',
        tags: [],
        text: 'A founder at a desk',
        type: 'image',
      },
      status: 'GENERATED',
      type: 'image',
    };
    mocks.gallery.mockReturnValue({
      isLoadingGallery: false,
      refresh: vi.fn(),
      storedJobs: [recipeJob],
    });

    render(<StudioGenerateWorkspace />);

    const resultsProps = mocks.results.mock.calls.at(-1)?.[0] as {
      onReprompt: (job: typeof recipeJob) => void;
      onSelect: (job: typeof recipeJob) => void;
    };
    act(() => resultsProps.onReprompt(recipeJob));

    expect(mocks.applyTypeSettings).toHaveBeenCalledWith(
      'image',
      expect.objectContaining({
        mood: 'confident',
        outputs: 4,
        promptTemplate: 'product-photo',
        style: 'editorial',
      }),
    );
    expect(screen.getByText('A founder at a desk')).toBeVisible();

    act(() => resultsProps.onSelect(recipeJob));
    fireEvent.click(screen.getByRole('button', { name: 'Vary' }));
    expect(mocks.applyTypeSettings).toHaveBeenCalledTimes(2);
  });

  it('applies an Agent handoff end-to-end: switches type, prefills the prompt, falls back an unavailable model and unsupported params with a notice, and attaches the resolved reference (#4716 review)', async () => {
    // The type has already "switched" by the time the model-catalog effect
    // reads it — `applyTypeSettings` is mocked, so this simulates the render
    // that follows the real hook's own state update.
    mocks.type.value = 'video';
    mocks.models.value = {
      isLoadingModels: false,
      models: [{ key: 'provider/model-allowed' }],
    };
    mocks.handoff.value = {
      isLoading: false,
      payload: {
        aspectRatio: '2.39:1', // not in the type's aspect-ratio ladder
        brandId: 'brand-1',
        duration: 999, // not one of the type's duration options
        modelKey: 'provider/model-unavailable', // not in the org's catalog
        outputs: 99, // over the type/model's output cap
        prompt: 'A neon skyline at dusk',
        references: ['asset-1'],
        type: 'video',
      },
    };
    mocks.findByIds.mockResolvedValue([
      {
        category: 'video',
        cdnUrl: 'https://cdn.example/neon.mp4',
        id: 'asset-1',
        metadataLabel: 'Neon skyline clip',
      },
    ]);

    render(<StudioGenerateWorkspace />);

    await waitFor(() => {
      expect(mocks.applyTypeSettings).toHaveBeenCalledWith(
        'video',
        expect.objectContaining({ modelKey: 'provider/model-unavailable' }),
      );
    });
    expect(screen.getByText('A neon skyline at dusk')).toBeVisible();

    await waitFor(() => {
      expect(mocks.findByIds).toHaveBeenCalledWith(['asset-1']);
    });
    await waitFor(() => {
      const composerProps = mocks.composer.mock.calls.at(-1)?.[0] as {
        attachedAssets: Array<{ id: string; name: string }>;
      };
      expect(composerProps.attachedAssets).toContainEqual(
        expect.objectContaining({ id: 'asset-1', name: 'Neon skyline clip' }),
      );
    });

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        modelKey: AUTO_MODEL_OPTION_VALUE,
      });
    });
    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: expect.any(String),
          duration: expect.any(Number),
          outputs: expect.any(Number),
        }),
      );
    });
    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.stringContaining('model pick'),
      );
    });
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.stringContaining('aspect ratio, duration, output count'),
    );
  });

  it('skips a handoff created under a different brand and shows the fallback notice instead of prefilling (#4716 review P2)', async () => {
    mocks.handoff.value = {
      isLoading: false,
      payload: {
        brandId: 'brand-other',
        modelKey: 'provider/model-x',
        prompt: 'Should never appear',
        type: 'image',
      },
    };

    render(<StudioGenerateWorkspace />);

    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        'That Studio handoff has expired or was already used. Continuing with your usual defaults.',
      );
    });
    expect(mocks.applyTypeSettings).not.toHaveBeenCalled();
    expect(screen.queryByText('Should never appear')).not.toBeInTheDocument();
  });
});
