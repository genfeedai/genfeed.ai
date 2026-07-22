// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Voice } from '@models/ingredients/voice.model';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFilters = {
  provider: '',
  search: '',
  sort: '',
  status: [] as string[],
  type: '',
};
const mockQuery = {
  provider: undefined as string | undefined,
  search: undefined as string | undefined,
  status: undefined as string | string[] | undefined,
};
const serviceMocks = vi.hoisted(() => ({
  deleteClonedVoice: vi.fn(),
  loggerError: vi.fn(),
  notificationError: vi.fn(),
  notificationSuccess: vi.fn(),
  patchSettings: vi.fn(),
  refreshBrands: vi.fn(),
  refreshSettings: vi.fn(),
  updateAgentConfig: vi.fn(),
  useBrand: vi.fn(),
  useOrganization: vi.fn(),
}));
const mockUseVoiceCatalog = vi.fn();
const mockRegisterRefresh = vi.fn();
const mockOpenUpload = vi.fn();
const mockCloseUpload = vi.fn();
const mockRouterReplace = vi.fn();
const mockSearchParamsGet = vi.fn(() => null);
const mockSearchParamsToString = vi.fn(() => '');

vi.mock('@contexts/content/ingredients-context/ingredients-context', () => ({
  useIngredientsContext: vi.fn(() => ({
    filters: mockFilters,
    onRefresh: mockRegisterRefresh,
    query: mockQuery,
  })),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => serviceMocks.useBrand(),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => serviceMocks.useOrganization(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));

vi.mock('@pages/library/voices/hooks/use-voice-catalog', () => ({
  useVoiceCatalog: (...args: unknown[]) => mockUseVoiceCatalog(...args),
}));

vi.mock('@pages/ingredients/layout/ingredients-layout', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="ingredients-layout">{children}</div>
  ),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useUploadModal: vi.fn(() => ({
    closeUpload: mockCloseUpload,
    openUpload: mockOpenUpload,
  })),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: serviceMocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: serviceMocks.notificationError,
      success: serviceMocks.notificationSuccess,
      warning: vi.fn(),
    })),
  },
}));

vi.mock('@services/ingredients/voice-clone.service', () => ({
  VoiceCloneService: {
    getInstance: () => ({
      deleteClonedVoice: serviceMocks.deleteClonedVoice,
    }),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      patchSettings: serviceMocks.patchSettings,
    }),
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: () => ({
      updateAgentConfig: serviceMocks.updateAgentConfig,
    }),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/library/voices'),
  useRouter: vi.fn(() => ({
    replace: mockRouterReplace,
  })),
  useSearchParams: vi.fn(() => ({
    get: mockSearchParamsGet,
    toString: mockSearchParamsToString,
  })),
}));

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({ label }: { label: string }) => (
    <div data-testid="audio-preview-player">{label}</div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <div data-testid="auto-pagination" />,
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    onChange,
    value,
    ...props
  }: {
    onChange?: (event: { target: { value: string; files?: File[] } }) => void;
    value?: string;
  }) => (
    <input
      {...props}
      onChange={(event) =>
        onChange?.({
          target: {
            files: event.currentTarget.files
              ? Array.from(event.currentTarget.files)
              : undefined,
            value: event.currentTarget.value,
          },
        })
      }
      value={value}
    />
  ),
}));

vi.mock('@ui/primitives/radio-group', () => ({
  RadioGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  RadioGroupItem: ({ value }: { value: string }) => (
    <input readOnly type="radio" value={value} />
  ),
}));

import LibraryVoicesPage from './library-voices-page';

function createVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    externalVoiceCatalogId: 'voice-catalog-1',
    externalVoiceId: 'voice-ext-1',
    id: 'voice-1',
    isCloned: false,
    isDefaultSelectable: true,
    metadataLabel: 'Rachel',
    provider: 'elevenlabs',
    sampleAudioUrl: 'https://example.test/rachel.mp3',
    voiceSource: 'catalog',
    ...overrides,
  } as Voice;
}

describe('LibraryVoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilters.provider = '';
    mockFilters.search = '';
    mockFilters.sort = '';
    mockFilters.status = [];
    mockFilters.type = '';
    mockQuery.provider = undefined;
    mockQuery.search = undefined;
    mockQuery.status = undefined;
    mockSearchParamsGet.mockReturnValue(null);
    mockSearchParamsToString.mockReturnValue('');
    serviceMocks.refreshBrands.mockResolvedValue(undefined);
    serviceMocks.refreshSettings.mockResolvedValue(undefined);
    serviceMocks.deleteClonedVoice.mockResolvedValue(undefined);
    serviceMocks.patchSettings.mockResolvedValue({});
    serviceMocks.updateAgentConfig.mockResolvedValue({});
    serviceMocks.useBrand.mockReturnValue({
      brandId: 'brand-123',
      organizationId: 'org-123',
      refreshBrands: serviceMocks.refreshBrands,
      selectedBrand: {
        agentConfig: {},
        label: 'Brand A',
      },
    });
    serviceMocks.useOrganization.mockReturnValue({
      refresh: serviceMocks.refreshSettings,
      settings: {},
    });
  });

  it('renders the row loading state while voices are loading', () => {
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: true,
      refresh: vi.fn(),
      voices: [],
    });

    render(<LibraryVoicesPage />);

    expect(screen.getByTestId('ingredients-layout')).toBeInTheDocument();
    expect(screen.getByTestId('voice-row-skeleton')).toBeInTheDocument();
  });

  it('renders the row list when voices are available', () => {
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
      voices: [createVoice()],
    });

    render(<LibraryVoicesPage />);

    expect(screen.getByTestId('voice-catalog-list')).toBeInTheDocument();
    expect(screen.getByText('1 voice on this page')).toBeInTheDocument();
    expect(screen.getAllByText('Rachel').length).toBeGreaterThan(0);
  });

  it('renders the empty state when no voices are available', () => {
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
      voices: [],
    });

    render(<LibraryVoicesPage />);

    expect(screen.getByText('No voices available yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Clone your first voice from an uploaded or recorded sample.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clone Voice' }),
    ).toBeInTheDocument();
  });

  it('renders a recoverable query error and retries without showing an empty state', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockUseVoiceCatalog.mockReturnValue({
      error: 'Voices could not be loaded.',
      isLoading: false,
      refresh,
      voices: [],
    });

    render(<LibraryVoicesPage />);

    expect(screen.getByText('Voices could not be loaded.')).toBeInTheDocument();
    expect(
      screen.queryByText('No voices available yet'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('clears active filters from the current route query', () => {
    mockFilters.provider = 'elevenlabs';
    mockFilters.search = 'rachel';
    mockFilters.sort = 'recent';
    mockFilters.status = ['generated'];
    mockFilters.type = 'voices';
    mockSearchParamsToString.mockReturnValue(
      'provider=elevenlabs&search=rachel&sort=recent&status=generated&type=voices&page=3&keep=1',
    );
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
      voices: [],
    });

    render(<LibraryVoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));

    expect(mockRouterReplace).toHaveBeenCalledWith('/library/voices?keep=1', {
      scroll: false,
    });
  });

  it('opens the clone upload modal from the empty state', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh,
      voices: [],
    });

    render(<LibraryVoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Clone Voice' }));

    expect(mockOpenUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'voice',
        isMultiple: false,
        maxFiles: 1,
        onConfirm: expect.any(Function),
      }),
    );

    const uploadOptions = mockOpenUpload.mock.calls[0]?.[0] as {
      onConfirm: () => void;
    };
    uploadOptions.onConfirm();

    expect(mockCloseUpload).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('maps route query filters to the voice catalog request and registers refresh', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('refresh failed'));
    mockQuery.provider = 'elevenlabs';
    mockQuery.search = 'rachel';
    mockQuery.status = ['ready', 'pending'];
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'page' ? '2' : null,
    );
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh,
      voices: [createVoice()],
    });

    render(<LibraryVoicesPage />);

    expect(mockUseVoiceCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        limit: 12,
        page: 2,
        pagination: true,
        providers: ['elevenlabs'],
        search: 'rachel',
        status: ['ready', 'pending'],
      }),
    );
    expect(mockRegisterRefresh).toHaveBeenCalledWith(expect.any(Function));

    const refreshCallback = mockRegisterRefresh.mock
      .calls[0]?.[0] as () => void;
    refreshCallback();

    await waitFor(() => {
      expect(serviceMocks.loggerError).toHaveBeenCalledWith(
        'Failed to refresh voices',
        expect.any(Error),
      );
    });
  });

  it('saves organization and brand default voices', async () => {
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
      voices: [createVoice()],
    });

    render(<LibraryVoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Set Org Default' }));
    await waitFor(() => {
      expect(serviceMocks.patchSettings).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          defaultVoiceId: 'voice-1',
          defaultVoiceProvider: 'elevenlabs',
          defaultVoiceRef: expect.objectContaining({
            externalVoiceId: 'voice-ext-1',
            provider: 'elevenlabs',
            source: 'catalog',
          }),
        }),
      );
      expect(serviceMocks.refreshSettings).toHaveBeenCalled();
      expect(serviceMocks.notificationSuccess).toHaveBeenCalledWith(
        'Organization default voice updated',
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Set Brand A Default' }),
    );
    await waitFor(() => {
      expect(serviceMocks.updateAgentConfig).toHaveBeenCalledWith(
        'brand-123',
        expect.objectContaining({
          defaultVoiceId: 'voice-1',
          defaultVoiceRef: expect.objectContaining({
            externalVoiceId: 'voice-ext-1',
            source: 'catalog',
          }),
        }),
      );
      expect(serviceMocks.refreshBrands).toHaveBeenCalled();
      expect(serviceMocks.notificationSuccess).toHaveBeenCalledWith(
        'Brand default voice updated',
      );
    });
  });

  it('deletes cloned voices and clears matching defaults', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const clonedVoice = createVoice({
      externalVoiceId: undefined,
      id: 'voice-cloned-1',
      isCloned: true,
      metadataLabel: 'Clone One',
      provider: 'genfeed-ai',
      voiceSource: 'cloned',
    });
    serviceMocks.useOrganization.mockReturnValue({
      refresh: serviceMocks.refreshSettings,
      settings: {
        defaultVoiceId: 'voice-cloned-1',
        defaultVoiceRef: {
          internalVoiceId: 'voice-cloned-1',
          source: 'cloned',
        },
      },
    });
    serviceMocks.useBrand.mockReturnValue({
      brandId: 'brand-123',
      organizationId: 'org-123',
      refreshBrands: serviceMocks.refreshBrands,
      selectedBrand: {
        agentConfig: {
          defaultVoiceId: 'voice-cloned-1',
          defaultVoiceRef: {
            internalVoiceId: 'voice-cloned-1',
            source: 'cloned',
          },
        },
        label: 'Brand A',
      },
    });
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh,
      voices: [clonedVoice],
    });

    render(<LibraryVoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Clone One' }));

    await waitFor(() => {
      expect(serviceMocks.deleteClonedVoice).toHaveBeenCalledWith(
        'voice-cloned-1',
      );
      expect(serviceMocks.patchSettings).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          defaultVoiceId: null,
          defaultVoiceProvider: null,
          defaultVoiceRef: null,
        }),
      );
      expect(serviceMocks.updateAgentConfig).toHaveBeenCalledWith(
        'brand-123',
        expect.objectContaining({
          defaultVoiceId: null,
          defaultVoiceRef: null,
        }),
      );
      expect(serviceMocks.notificationSuccess).toHaveBeenCalledWith(
        'Voice deleted',
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('reports unavailable context and service failures', async () => {
    serviceMocks.useBrand.mockReturnValue({
      brandId: null,
      organizationId: null,
      refreshBrands: serviceMocks.refreshBrands,
      selectedBrand: {
        agentConfig: {},
        label: 'Brand A',
      },
    });
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
      voices: [createVoice()],
    });
    const { rerender } = render(<LibraryVoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Set Org Default' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Set Brand A Default' }),
    );
    expect(serviceMocks.notificationError).toHaveBeenCalledWith(
      'Organization context is unavailable',
    );
    expect(serviceMocks.notificationError).toHaveBeenCalledWith(
      'Brand context is unavailable',
    );

    serviceMocks.useBrand.mockReturnValue({
      brandId: 'brand-123',
      organizationId: 'org-123',
      refreshBrands: serviceMocks.refreshBrands,
      selectedBrand: {
        agentConfig: {},
        label: 'Brand A',
      },
    });
    serviceMocks.patchSettings.mockRejectedValueOnce(new Error('org failed'));
    serviceMocks.updateAgentConfig.mockRejectedValueOnce(
      new Error('brand failed'),
    );
    rerender(<LibraryVoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Set Org Default' }));
    await waitFor(() => {
      expect(serviceMocks.loggerError).toHaveBeenCalledWith(
        'Failed to save organization default voice',
        expect.any(Error),
      );
      expect(serviceMocks.notificationError).toHaveBeenCalledWith(
        'Failed to save organization default voice',
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Set Brand A Default' }),
    );
    await waitFor(() => {
      expect(serviceMocks.loggerError).toHaveBeenCalledWith(
        'Failed to save brand default voice',
        expect.any(Error),
      );
      expect(serviceMocks.notificationError).toHaveBeenCalledWith(
        'Failed to save brand default voice',
      );
    });

    serviceMocks.deleteClonedVoice.mockRejectedValueOnce(
      new Error('delete failed'),
    );
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
      voices: [
        createVoice({
          id: 'voice-cloned-1',
          isCloned: true,
          metadataLabel: 'Clone One',
          voiceSource: 'cloned',
        }),
      ],
    });
    rerender(<LibraryVoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Clone One' }));
    await waitFor(() => {
      expect(serviceMocks.loggerError).toHaveBeenCalledWith(
        'Failed to delete voice',
        expect.any(Error),
      );
      expect(serviceMocks.notificationError).toHaveBeenCalledWith(
        'Failed to delete voice',
      );
    });
  });
});
