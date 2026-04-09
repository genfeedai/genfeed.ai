// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFilters = {
  provider: '',
  search: '',
  sort: '',
  status: [] as string[],
  type: '',
};
const mockUseVoiceCatalog = vi.fn();
const mockRegisterRefresh = vi.fn();
const mockOpenUpload = vi.fn();
const mockRouterReplace = vi.fn();
const mockSearchParamsGet = vi.fn(() => null);
const mockSearchParamsToString = vi.fn(() => '');

vi.mock('@contexts/content/ingredients-context/ingredients-context', () => ({
  useIngredientsContext: vi.fn(() => ({
    filters: mockFilters,
    onRefresh: mockRegisterRefresh,
    query: {},
  })),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    organizationId: 'org-123',
    refreshBrands: vi.fn(),
    selectedBrand: {
      agentConfig: {},
      label: 'Brand A',
    },
  })),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    refresh: vi.fn(),
    settings: {},
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
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
    closeUpload: vi.fn(),
    openUpload: mockOpenUpload,
  })),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    })),
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

describe('LibraryVoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilters.provider = '';
    mockFilters.search = '';
    mockFilters.sort = '';
    mockFilters.status = [];
    mockFilters.type = '';
    mockSearchParamsGet.mockReturnValue(null);
    mockSearchParamsToString.mockReturnValue('');
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
      voices: [
        {
          externalVoiceId: 'voice-ext-1',
          id: 'voice-1',
          isDefaultSelectable: true,
          metadataLabel: 'Rachel',
          provider: 'elevenlabs',
          voiceSource: 'catalog',
        },
      ],
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
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
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
  });
});
