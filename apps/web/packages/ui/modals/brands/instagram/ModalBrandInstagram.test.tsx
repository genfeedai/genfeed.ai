import { useAuth } from '@clerk/nextjs';
import type { ICredential, IUser } from '@genfeedai/interfaces';
import { Brand } from '@models/organization/brand.model';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModalBrandInstagram from '@ui/modals/brands/instagram/ModalBrandInstagram';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

interface MockCredentialsService {
  findCredentialInstagramPages: MockFn;
  patch?: MockFn;
}

interface MockServicesService {
  postConnect: MockFn;
}

// Mock dependencies
vi.mock('@clerk/nextjs');
vi.mock('@services/external/services.service');
vi.mock('@services/core/notifications.service');
vi.mock('@services/organization/credentials.service');

// Mock fetch
global.fetch = vi.fn();

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockWindowOpen,
  writable: true,
});

describe.skip('ModalBrandInstagram', () => {
  const mockGetToken = vi.fn();
  const mockBrand = new Brand({
    id: 'account123',
    label: 'Test Account',
    user: { id: 'user123' } as IUser,
  });

  const mockCredential: Partial<ICredential> = {
    id: 'credential123',
    label: 'Test Instagram Credential',
    type: 'instagram',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      getToken: mockGetToken,
    } as ReturnType<typeof useAuth>);
    mockGetToken.mockResolvedValue('mock-token');
  });

  it('renders modal with correct title and description', async () => {
    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={null}
        onConfirm={() => {}}
      />,
    );

    expect(
      screen.getByText('Connect Instagram Business Account'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Connect an Instagram Business account'),
    ).toBeInTheDocument();
  });

  it.skip('shows loading state while fetching handles', async () => {
    const mockCredentialsService = {
      findCredentialInstagramPages: vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
        ),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    // Should show loading spinner when credential is provided
    // The component shows "Loading Instagram pages..." text and an animated spinner
    await waitFor(() => {
      expect(
        screen.getByText('Loading Instagram pages...'),
      ).toBeInTheDocument();
    });
  });

  it('displays available Instagram handles', async () => {
    const mockHandles = [
      {
        id: 'instagram123',
        image: '/test-image.jpg',
        label: 'Test Business',
        username: '@testbusiness',
      },
    ];

    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue(mockHandles),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Test Business')).toBeInTheDocument();
      expect(screen.getByText('@testbusiness')).toBeInTheDocument();
    });
  });

  it('shows info banner when handles are available', async () => {
    const mockHandles = [
      {
        id: 'instagram123',
        image: '/test-image.jpg',
        label: 'Test Business',
        username: '@testbusiness',
      },
    ];

    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue(mockHandles),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Complete Your Instagram Setup'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Your Instagram account is connected but not linked/),
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when no handles are available', async () => {
    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('No Instagram Business Brands Found'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Make sure you have an Instagram Business account/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Only Instagram Business accounts can publish content/,
        ),
      ).toBeInTheDocument();
    });
  });

  it('handles selection of Instagram handle', async () => {
    const mockHandles = [
      {
        id: 'instagram123',
        image: '/test-image.jpg',
        label: 'Test Business',
        username: '@testbusiness',
      },
    ];

    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue(mockHandles),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Test Business')).toBeInTheDocument();
    });

    // Click on the handle to select it
    const handleElement = screen
      .getByText('Test Business')
      .closest('div[class*="cursor-pointer"]');
    fireEvent.click(handleElement!);

    // Check if the handle is selected (has check icon)
    await waitFor(() => {
      expect(screen.getByText('Test Business')).toBeInTheDocument();
    });
  });

  it('shows no accounts found state initially', async () => {
    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={null}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('No Instagram Business Brands Found'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Make sure you have an Instagram Business account connected/,
        ),
      ).toBeInTheDocument();
    });
  });

  it('shows connect business account button when no credential exists', async () => {
    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={null}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      const connectButton = screen.getByText('Connect business account');
      expect(connectButton).toBeInTheDocument();
      expect(connectButton).not.toBeDisabled();
    });
  });

  it('initiates OAuth flow when connect business account is clicked', async () => {
    const mockServicesService = {
      postConnect: vi.fn().mockResolvedValue({
        url: 'https://instagram.com/oauth',
      }),
    };

    vi.mocked(ServicesService).mockImplementation(
      () => mockServicesService as unknown as ServicesService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={null}
        onConfirm={() => {}}
      />,
    );

    const connectButton = await screen.findByText('Connect business account');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mockServicesService.postConnect).toHaveBeenCalledWith({
        account: mockBrand.id,
      });
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://instagram.com/oauth',
        '_self',
      );
    });
  });

  it('shows error when OAuth initiation fails', async () => {
    const mockServicesService = {
      postConnect: vi.fn().mockRejectedValue(new Error('OAuth failed')),
    };

    vi.mocked(ServicesService).mockImplementation(
      () => mockServicesService as unknown as ServicesService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={null}
        onConfirm={() => {}}
      />,
    );

    const connectButton = await screen.findByText('Connect business account');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Failed to initiate Instagram connection. Please try again.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('disables connect button when no handle is selected', async () => {
    const mockHandles = [
      {
        id: 'instagram123',
        image: '/test-image.jpg',
        label: 'Test Business',
        username: '@testbusiness',
      },
    ];

    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue(mockHandles),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      const connectButton = screen.getByText('Connect Selected Account');
      expect(connectButton).toBeDisabled();
    });
  });

  it('enables connect button when handle is selected', async () => {
    const mockHandles = [
      {
        id: 'instagram123',
        image: '/test-image.jpg',
        label: 'Test Business',
        username: '@testbusiness',
      },
    ];

    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue(mockHandles),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    // Wait for handles to load and select one
    await waitFor(() => {
      expect(screen.getByText('Test Business')).toBeInTheDocument();
    });

    const handleElement = screen
      .getByText('Test Business')
      .closest('div[class*="cursor-pointer"]');
    fireEvent.click(handleElement!);

    await waitFor(() => {
      const connectButton = screen.getByText('Connect Selected Account');
      expect(connectButton).not.toBeDisabled();
    });
  });

  it('shows loading state during connection', async () => {
    const mockHandles = [
      {
        id: 'instagram123',
        image: '/test-image.jpg',
        label: 'Test Business',
        username: '@testbusiness',
      },
    ];

    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue(mockHandles),
      patch: vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100)),
        ),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );
    vi.mocked(CredentialsService).mockImplementation(
      () => mockCredentialsService as unknown as CredentialsService,
    );

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    // Wait for handles to load and select one
    await waitFor(() => {
      expect(screen.getByText('Test Business')).toBeInTheDocument();
    });

    const handleElement = screen
      .getByText('Test Business')
      .closest('div[class*="cursor-pointer"]');
    fireEvent.click(handleElement!);

    const connectButton = await screen.findByText('Connect Selected Account');
    fireEvent.click(connectButton);

    // Should show loading state on the button
    await waitFor(() => {
      expect(connectButton).toBeDisabled();
    });
  });

  it('handles API fetch error', async () => {
    (fetch as Mock).mockRejectedValue(new Error('API Error'));

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'Failed to load Instagram accounts. Please try again.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('handles connection error', async () => {
    const mockHandles = [
      {
        id: 'instagram123',
        image: '/test-image.jpg',
        label: 'Test Business',
        username: '@testbusiness',
      },
    ];

    const mockCredentialsService = {
      findCredentialInstagramPages: vi.fn().mockResolvedValue(mockHandles),
      patch: vi.fn().mockRejectedValue(new Error('Connection failed')),
    };

    vi.mocked(CredentialsService.getInstance).mockReturnValue(
      mockCredentialsService as unknown as CredentialsService,
    );

    const mockError = vi.fn();
    (NotificationsService.getInstance as Mock).mockReturnValue({
      error: mockError,
    });

    render(
      <ModalBrandInstagram
        brand={mockBrand}
        credential={mockCredential as ICredential}
        onConfirm={() => {}}
      />,
    );

    // Wait for handles to load
    await waitFor(() => {
      expect(screen.getByText('Test Business')).toBeInTheDocument();
    });

    // Select the handle
    const handleElement = screen
      .getByText('Test Business')
      .closest('div[class*="cursor-pointer"]');
    fireEvent.click(handleElement!);

    // Click connect button
    const connectButton = await screen.findByText('Connect Selected Account');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mockError).toHaveBeenCalledWith(
        'Failed to connect Instagram brand. Please try again.',
      );
    });
  });
});
