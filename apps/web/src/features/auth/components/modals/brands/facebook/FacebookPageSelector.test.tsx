import { queryClientWrapper } from '@app-tests/query-client.harness';
import {
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FacebookPageSelector from '@/features/auth/components/modals/brands/facebook/FacebookPageSelector';

const mockServices = vi.hoisted(() => ({
  getFacebookPages: vi.fn(),
  postSelectPages: vi.fn(),
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
    getFacebookPages(...args: unknown[]) {
      return mockServices.getFacebookPages(...args);
    }
    postSelectPages(...args: unknown[]) {
      return mockServices.postSelectPages(...args);
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
  category: 'Coffee Shop',
  id: '1000',
  isAlreadyConnected: false,
  name: 'Corner Cafe',
};
const BAKERY = {
  category: 'Bakery',
  id: '2000',
  isAlreadyConnected: true,
  name: 'Harbour Bakery',
};

function buildPages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    category: 'Retail',
    id: String(index + 1),
    isAlreadyConnected: false,
    name: `Branch ${String(index + 1).padStart(2, '0')}`,
  }));
}

describe('FacebookPageSelector', () => {
  const credentialId = 'credential-pending-1';

  beforeEach(() => {
    mockServices.getFacebookPages = vi.fn().mockResolvedValue([CAFE, BAKERY]);
    mockServices.postSelectPages = vi.fn();
  });

  it('lists each Page with its category and flags the ones the brand already holds', async () => {
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(await screen.findByText('Corner Cafe')).toBeInTheDocument();
    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.getByText('Harbour Bakery')).toBeInTheDocument();
    expect(screen.getAllByText('Already connected')).toHaveLength(1);
    expect(mockServices.getFacebookPages).toHaveBeenCalledWith(
      credentialId,
      expect.any(AbortSignal),
    );
  });

  it('keeps Connect disabled until a Page is ticked', async () => {
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Connect Pages' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Corner Cafe/ }));

    expect(
      screen.getByRole('button', { name: 'Connect 1 Page' }),
    ).toBeEnabled();
  });

  it('connects every ticked Page in list order and shows the first', async () => {
    const onConnected = vi.fn();
    mockServices.postSelectPages.mockResolvedValue([
      { externalId: CAFE.id, externalName: 'Corner Cafe' },
      { externalId: BAKERY.id, externalName: 'Harbour Bakery' },
    ]);
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Harbour/ }));
    fireEvent.click(screen.getByRole('button', { name: /Corner Cafe/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect 2 Pages' }));

    await waitFor(() =>
      expect(onConnected).toHaveBeenCalledWith(
        { avatarUrl: undefined, name: 'Corner Cafe' },
        [
          { externalId: CAFE.id, externalName: 'Corner Cafe' },
          { externalId: BAKERY.id, externalName: 'Harbour Bakery' },
        ],
      ),
    );
    expect(mockServices.postSelectPages).toHaveBeenCalledWith(credentialId, [
      CAFE.id,
      BAKERY.id,
    ]);
  });

  it('says which Pages did not connect, then continues', async () => {
    const onConnected = vi.fn();
    mockServices.postSelectPages.mockResolvedValue([
      { externalId: CAFE.id, externalName: 'Corner Cafe' },
    ]);
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Corner Cafe/ }));
    fireEvent.click(screen.getByRole('button', { name: /Harbour/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect 2 Pages' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Connected 1 of 2 Pages. Not connected: Harbour Bakery. Run connect again to add them.',
    );
    expect(onConnected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onConnected).toHaveBeenCalledWith(
      { avatarUrl: undefined, name: 'Corner Cafe' },
      [{ externalId: CAFE.id, externalName: 'Corner Cafe' }],
    );
  });

  it('keeps the selection and reports a failed connect', async () => {
    const onError = vi.fn();
    mockServices.postSelectPages.mockRejectedValue(new Error('refused'));
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
        onError={onError}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Corner Cafe/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect 1 Page' }));

    expect(
      await screen.findByText(
        'Failed to connect these Pages. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(
      'Failed to connect these Pages. Please try again.',
    );
    expect(screen.getByRole('button', { name: /Corner Cafe/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers Try again and Go back when the list cannot load', async () => {
    const onBack = vi.fn();
    mockServices.getFacebookPages = vi
      .fn()
      .mockRejectedValue(new Error('down'));
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('Failed to load Pages. Please try again.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Go back'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('cancels without saving', async () => {
    const onBack = vi.fn();
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onBack={onBack}
        onConnected={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockServices.postSelectPages).not.toHaveBeenCalled();
  });

  it('connects exactly 25 Pages without showing the limit', async () => {
    const pages = buildPages(25);
    mockServices.getFacebookPages = vi.fn().mockResolvedValue(pages);
    mockServices.postSelectPages.mockResolvedValue(
      pages.map((page) => ({
        externalId: page.id,
        externalName: page.name,
      })),
    );
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await screen.findByText('Branch 01');
    for (const page of pages) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(page.name) }),
      );
    }
    fireEvent.click(screen.getByRole('button', { name: 'Connect 25 Pages' }));

    await waitFor(() =>
      expect(mockServices.postSelectPages).toHaveBeenCalledWith(
        credentialId,
        pages.map((page) => page.id),
      ),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores a 26th Page and says the limit is 25', async () => {
    const pages = buildPages(26);
    mockServices.getFacebookPages = vi.fn().mockResolvedValue(pages);
    render(
      <FacebookPageSelector
        credentialId={credentialId}
        onConnected={vi.fn()}
      />,
    );

    await screen.findByText('Branch 01');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Connect up to 25 Pages at a time.',
    );

    for (const page of pages) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(page.name) }),
      );
    }

    expect(
      screen.getByRole('button', { name: 'Connect 25 Pages' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /Branch 26/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '25 Pages selected, the most one connect can add.',
    );

    fireEvent.click(screen.getByRole('button', { name: /Branch 25/ }));
    fireEvent.click(screen.getByRole('button', { name: /Branch 26/ }));

    expect(screen.getByRole('button', { name: /Branch 26/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
