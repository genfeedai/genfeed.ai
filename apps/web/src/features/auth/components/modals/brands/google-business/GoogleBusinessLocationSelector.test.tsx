import { queryClientWrapper } from '@app-tests/query-client.harness';
import {
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GoogleBusinessLocationSelector from '@/features/auth/components/modals/brands/google-business/GoogleBusinessLocationSelector';

const mockServices = vi.hoisted(() => ({
  getGoogleBusinessLocations: vi.fn(),
  postSelectLocations: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('mock-token'),
}));

// A real class keeps `new` semantics; an automock arrow function would make
// the component report a TypeError as an ordinary load failure.
vi.mock('@genfeedai/services/external/services.service', () => ({
  ServicesService: class {
    getGoogleBusinessLocations(...args: unknown[]) {
      return mockServices.getGoogleBusinessLocations(...args);
    }
    postSelectLocations(...args: unknown[]) {
      return mockServices.postSelectLocations(...args);
    }
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function render(ui: ReactElement) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper() });
}

const CAFE = {
  address: '1 High Street, Leeds',
  id: 'accounts/1/locations/10',
  isAlreadyConnected: false,
  title: 'Corner Cafe',
};
const BAKERY = {
  address: '9 Dock Road, Leeds',
  id: 'accounts/1/locations/20',
  isAlreadyConnected: true,
  title: 'Harbour Bakery',
};

function buildLocations(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    address: `${index + 1} Chain Street`,
    id: `accounts/1/locations/${index + 1}`,
    isAlreadyConnected: false,
    title: `Branch ${String(index + 1).padStart(2, '0')}`,
  }));
}

describe('GoogleBusinessLocationSelector', () => {
  const credentialId = 'credential-pending-1';

  beforeEach(() => {
    mockServices.getGoogleBusinessLocations = vi
      .fn()
      .mockResolvedValue([CAFE, BAKERY]);
    mockServices.postSelectLocations = vi.fn();
  });

  it('lists each location with its address and flags the ones the brand already holds', async () => {
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(await screen.findByText('Corner Cafe')).toBeInTheDocument();
    expect(screen.getByText('1 High Street, Leeds')).toBeInTheDocument();
    expect(screen.getByText('Harbour Bakery')).toBeInTheDocument();
    expect(screen.getAllByText('Already connected')).toHaveLength(1);
    expect(mockServices.getGoogleBusinessLocations).toHaveBeenCalledWith(
      credentialId,
      expect.any(AbortSignal),
    );
  });

  it('keeps Connect disabled until a location is ticked', async () => {
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Connect locations' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Corner Cafe/ }));

    expect(
      screen.getByRole('button', { name: 'Connect 1 location' }),
    ).toBeEnabled();
  });

  it('connects every ticked location in list order and shows the first', async () => {
    const onConnected = vi.fn();
    mockServices.postSelectLocations.mockResolvedValue([
      { externalId: CAFE.id, externalName: 'Corner Cafe' },
      { externalId: BAKERY.id, externalName: 'Harbour Bakery' },
    ]);
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Harbour/ }));
    fireEvent.click(screen.getByRole('button', { name: /Corner Cafe/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect 2 locations' }),
    );

    await waitFor(() =>
      expect(onConnected).toHaveBeenCalledWith({
        avatarUrl: undefined,
        name: 'Corner Cafe',
      }),
    );
    expect(mockServices.postSelectLocations).toHaveBeenCalledWith(
      credentialId,
      [CAFE.id, BAKERY.id],
    );
  });

  it('says which locations did not connect, then continues', async () => {
    const onConnected = vi.fn();
    mockServices.postSelectLocations.mockResolvedValue([
      { externalId: CAFE.id, externalName: 'Corner Cafe' },
    ]);
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Corner Cafe/ }));
    fireEvent.click(screen.getByRole('button', { name: /Harbour/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect 2 locations' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Connected 1 of 2 locations. Not connected: Harbour Bakery. Run connect again to add them.',
    );
    expect(onConnected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onConnected).toHaveBeenCalledWith({
      avatarUrl: undefined,
      name: 'Corner Cafe',
    });
  });

  it('keeps the selection and reports a failed connect', async () => {
    const onError = vi.fn();
    mockServices.postSelectLocations.mockRejectedValue(new Error('refused'));
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
        onError={onError}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Corner Cafe/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect 1 location' }));

    expect(
      await screen.findByText(
        'Failed to connect these locations. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(
      'Failed to connect these locations. Please try again.',
    );
    expect(screen.getByRole('button', { name: /Corner Cafe/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers Try again and Go back when the list cannot load', async () => {
    const onBack = vi.fn();
    mockServices.getGoogleBusinessLocations = vi
      .fn()
      .mockRejectedValue(new Error('down'));
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('Failed to load locations. Please try again.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Go back'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('cancels without saving', async () => {
    const onBack = vi.fn();
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockServices.postSelectLocations).not.toHaveBeenCalled();
  });

  it('connects exactly 25 locations without showing the limit', async () => {
    const locations = buildLocations(25);
    mockServices.getGoogleBusinessLocations = vi
      .fn()
      .mockResolvedValue(locations);
    mockServices.postSelectLocations.mockResolvedValue(
      locations.map((location) => ({
        externalId: location.id,
        externalName: location.title,
      })),
    );
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await screen.findByText('Branch 01');
    for (const location of locations) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^${location.title}`) }),
      );
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect 25 locations' }),
    );

    await waitFor(() =>
      expect(mockServices.postSelectLocations).toHaveBeenCalledWith(
        credentialId,
        locations.map((location) => location.id),
      ),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores a 26th location and says the limit is 25', async () => {
    const locations = buildLocations(26);
    mockServices.getGoogleBusinessLocations = vi
      .fn()
      .mockResolvedValue(locations);
    render(
      <GoogleBusinessLocationSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await screen.findByText('Branch 01');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Connect up to 25 locations at a time.',
    );

    for (const location of locations) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`^${location.title}`) }),
      );
    }

    expect(
      screen.getByRole('button', { name: 'Connect 25 locations' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Branch 26/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '25 locations selected, the most one connect can add.',
    );

    fireEvent.click(screen.getByRole('button', { name: /^Branch 25/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Branch 26/ }));

    expect(screen.getByRole('button', { name: /^Branch 26/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
