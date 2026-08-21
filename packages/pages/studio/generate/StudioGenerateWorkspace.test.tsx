import { act, render, screen } from '@testing-library/react';
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
  composer: vi.fn(),
  gallery: vi.fn(),
  results: vi.fn(),
  removeJob: vi.fn(),
  settings: vi.fn(),
  submit: vi.fn(),
}));

vi.mock('@genfeedai/agent', () => ({
  runAgentApiEffect: vi.fn(),
  useAgentApiService: () => null,
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
  default: (props: unknown) => {
    mocks.composer(props);
    return <div data-testid="studio-composer" />;
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
  useStudioGenerateModels: () => ({ isLoadingModels: false, models: [] }),
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateSettings', () => ({
  useStudioGenerateSettings: mocks.settings,
}));

vi.mock('@pages/studio/generate/hooks/useStudioGeneration', () => ({
  useStudioGeneration: () => ({
    isGenerating: false,
    jobs: [],
    removeJob: mocks.removeJob,
    submit: mocks.submit,
  }),
}));

describe('StudioGenerateWorkspace', () => {
  beforeEach(() => {
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
      setType: vi.fn(),
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

  it('submits completed Agent-style attachments as generation references', () => {
    render(<StudioGenerateWorkspace />);

    const initialProps = mocks.composer.mock.calls.at(-1)?.[0] as {
      onPromptChange: (value: string) => void;
    };
    act(() => initialProps.onPromptChange('Use this composition'));

    const currentProps = mocks.composer.mock.calls.at(-1)?.[0] as {
      onSubmit: () => void;
    };
    act(() => currentProps.onSubmit());

    expect(mocks.submit).toHaveBeenCalledWith('Use this composition', [
      'https://cdn.example/reference.png',
    ]);
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
});
