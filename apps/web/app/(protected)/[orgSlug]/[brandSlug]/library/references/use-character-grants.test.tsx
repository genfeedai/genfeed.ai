// @vitest-environment jsdom
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type {
  BrandCharacterListItem,
  CharacterGrantItem,
} from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCharacterGrants } from './use-character-grants';

const mocks = vi.hoisted(() => ({
  listGrantableOrganizations: vi.fn(),
  listGrants: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/content/personas.service', () => ({
  PersonasService: {
    getInstance: () => ({
      listGrantableOrganizations: mocks.listGrantableOrganizations,
      listGrants: mocks.listGrants,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const ben: BrandCharacterListItem = {
  id: 'p2',
  label: 'Ben',
  referenceIngredientIds: [],
};
const cleo: BrandCharacterListItem = {
  id: 'p3',
  label: 'Cleo',
  referenceIngredientIds: [],
};
const bensGrant: CharacterGrantItem = {
  availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
  availableBrandIds: [],
  grantedAt: '2026-10-04T00:00:00.000Z',
  id: 'grant-1',
  recipientOrganizationId: 'org-2',
  recipientOrganizationName: 'ShipShit Show',
};

describe('useCharacterGrants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listGrants.mockResolvedValue([bensGrant]);
    mocks.listGrantableOrganizations.mockResolvedValue([]);
  });

  it('returns the cached grants at once when the dialog reopens', async () => {
    const client = createTestQueryClient();
    const firstOpen = renderHook(() => useCharacterGrants(ben), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(firstOpen.result.current.grants).toHaveLength(1),
    );
    firstOpen.unmount();

    mocks.listGrants.mockReturnValue(new Promise(() => {}));
    mocks.listGrantableOrganizations.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCharacterGrants(ben), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.grants).toEqual([bensGrant]);
    expect(result.current.isLoading).toBe(false);
  });

  it('never shows one character’s grants for another character', async () => {
    const client = createTestQueryClient();
    const { rerender, result } = renderHook(
      ({ character }) => useCharacterGrants(character),
      {
        initialProps: { character: ben },
        wrapper: queryClientWrapper(client),
      },
    );
    await waitFor(() => expect(result.current.grants).toHaveLength(1));

    mocks.listGrants.mockReturnValue(new Promise(() => {}));
    rerender({ character: cleo });

    expect(result.current.grants).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('reads nothing for a character granted to this organization', () => {
    const { result } = renderHook(
      () => useCharacterGrants({ ...ben, isGranted: true }),
      { wrapper: queryClientWrapper() },
    );

    expect(result.current.grants).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
