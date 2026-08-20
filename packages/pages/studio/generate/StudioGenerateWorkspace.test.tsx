import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioGenerateWorkspace from './StudioGenerateWorkspace';

const mocks = vi.hoisted(() => ({
  attachments: vi.fn(),
  composer: vi.fn(),
  gallery: vi.fn(),
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
  default: () => <div data-testid="studio-results" />,
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

  it('uses the composer asset type as the only gallery type control', () => {
    render(<StudioGenerateWorkspace />);

    const topbar = screen.getByTestId('section-topbar');
    expect(topbar).toContainElement(
      screen.getByPlaceholderText('Search generations'),
    );
    expect(screen.queryByTestId('section-topbar-tabs')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(mocks.gallery).toHaveBeenCalledWith({
      brandId: 'brand-1',
      filter: 'image',
    });
    expect(screen.getByTestId('studio-results')).not.toContainElement(
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
});
