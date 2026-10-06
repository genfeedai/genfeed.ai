// @vitest-environment jsdom
'use client';

import {
  IngredientStatus,
  MemberRole,
  PersonaAvailabilityMode,
} from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryCharactersPage from './content';

const mocks = vi.hoisted(() => {
  const composeSheetPrompt = vi.fn();
  const createFromSheet = vi.fn();
  const listCharacters = vi.fn();
  const updateAvailability = vi.fn();
  const moveOwnership = vi.fn();
  const listGrants = vi.fn();
  const listGrantableOrganizations = vi.fn();
  const grantToOrganization = vi.fn();
  const revokeGrant = vi.fn();
  const postImage = vi.fn();
  const personasService = {
    composeSheetPrompt,
    createFromSheet,
    grantToOrganization,
    listCharacters,
    listGrantableOrganizations,
    listGrants,
    moveOwnership,
    revokeGrant,
    updateAvailability,
  };
  const imagesService = { post: postImage };
  return {
    role: undefined as string | undefined,
    grantToOrganization,
    listGrantableOrganizations,
    listGrants,
    moveOwnership,
    revokeGrant,
    updateAvailability,
    composeSheetPrompt,
    createFromSheet,
    getImagesService: async () => imagesService,
    getPersonasService: async () => personasService,
    listCharacters,
    postImage,
  };
});

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    ...props
  }: {
    alt: string;
    src: string;
    'data-testid'?: string;
  }) => (
    <span data-src={src} data-testid={props['data-testid']}>
      {alt}
    </span>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [
      { id: 'brand-1', label: 'Personal brand' },
      { id: 'brand-2', label: 'Podcast' },
      { id: 'brand-3', label: 'Newsletter' },
    ],
  }),
}));

vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const created = factory('test-token') as { listCharacters?: unknown };
    if (created && typeof created === 'object' && 'listCharacters' in created) {
      return mocks.getPersonasService;
    }
    return mocks.getImagesService;
  },
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: vi.fn(() => vi.fn()) }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://cdn.test/ingredients',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    }),
  },
}));

vi.mock('@services/core/socket-manager.service', () => ({
  createMediaHandler: vi.fn(),
}));

vi.mock('@services/content/personas.service', () => ({
  PersonasService: {
    getInstance: () => ({
      composeSheetPrompt: mocks.composeSheetPrompt,
      createFromSheet: mocks.createFromSheet,
      grantToOrganization: mocks.grantToOrganization,
      listCharacters: mocks.listCharacters,
      listGrantableOrganizations: mocks.listGrantableOrganizations,
      listGrants: mocks.listGrants,
      moveOwnership: mocks.moveOwnership,
      revokeGrant: mocks.revokeGrant,
      updateAvailability: mocks.updateAvailability,
    }),
  },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({
      post: mocks.postImage,
    }),
  },
}));

describe('LibraryCharactersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = MemberRole.USER;
    mocks.listCharacters.mockResolvedValue([]);
    mocks.updateAvailability.mockResolvedValue({ id: 'p1' });
    mocks.moveOwnership.mockResolvedValue({ id: 'p1' });
    mocks.listGrants.mockResolvedValue([]);
    mocks.listGrantableOrganizations.mockResolvedValue([]);
    mocks.grantToOrganization.mockResolvedValue(undefined);
    mocks.revokeGrant.mockResolvedValue(undefined);
    mocks.composeSheetPrompt.mockResolvedValue({
      prompt:
        'CHARACTER REFERENCE SHEET PRESET v1.0.0\n<<<CHARACTER_DESCRIPTION>>>a tall woman<<<END_CHARACTER_DESCRIPTION>>>',
    });
    mocks.postImage.mockResolvedValue({
      id: 'img-1',
      status: IngredientStatus.GENERATED,
      url: 'https://cdn.test/img-1.jpg',
    });
    mocks.createFromSheet.mockResolvedValue({
      handle: 'anna',
      id: 'p1',
      label: 'Anna',
    });
  });

  it('renders section chrome and the characters table while the list loads', async () => {
    let resolveListCharacters!: (rows: Array<unknown>) => void;
    mocks.listCharacters.mockReturnValue(
      new Promise((resolve) => {
        resolveListCharacters = resolve;
      }),
    );

    render(<LibraryCharactersPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Characters' }),
    ).toBeInTheDocument();

    resolveListCharacters([]);
    await waitFor(() => {
      expect(screen.getByText('Characters')).toBeInTheDocument();
    });
  });

  it('links to character guidance without adding another creation action', async () => {
    render(<LibraryCharactersPage />);
    await screen.findByText('New character');
    expect(
      screen.getByRole('link', {
        name: 'Learn how to create, save, and reuse characters',
      }),
    ).toHaveAttribute('href', '/settings/help#characters');
    expect(
      screen.getAllByRole('button', { name: 'New character' }),
    ).toHaveLength(1);
  });

  it('opens the create dialog and generates a sheet from the description', async () => {
    render(<LibraryCharactersPage />);

    fireEvent.click(await screen.findByText('New character'));

    await screen.findByTestId('character-description');
    fireEvent.change(screen.getByTestId('character-description'), {
      target: { value: 'a tall woman' },
    });
    fireEvent.click(screen.getByTestId('generate-sheet'));

    await waitFor(() => {
      expect(mocks.composeSheetPrompt).toHaveBeenCalledWith({
        description: 'a tall woman',
        isNonHumanoid: false,
      });
    });
    expect(mocks.postImage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('CHARACTER REFERENCE SHEET PRESET'),
      }),
    );
    expect(mocks.createFromSheet).not.toHaveBeenCalled();
    expect(await screen.findByTestId('candidate-image')).toBeInTheDocument();
  });

  it('does not create a persona when the candidate is discarded', async () => {
    render(<LibraryCharactersPage />);

    fireEvent.click(await screen.findByText('New character'));
    await screen.findByTestId('character-description');

    fireEvent.change(screen.getByTestId('character-description'), {
      target: { value: 'a tall woman' },
    });
    fireEvent.click(screen.getByTestId('generate-sheet'));
    await screen.findByTestId('candidate-image');

    fireEvent.click(screen.getByTestId('discard-sheet'));

    expect(mocks.createFromSheet).not.toHaveBeenCalled();
    expect(screen.queryByTestId('candidate-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('generate-sheet')).toBeInTheDocument();
  });

  it('creates a persona from the approved sheet', async () => {
    render(<LibraryCharactersPage />);

    fireEvent.click(await screen.findByText('New character'));
    await screen.findByTestId('character-description');

    fireEvent.change(screen.getByTestId('character-description'), {
      target: { value: 'a tall woman' },
    });
    fireEvent.click(screen.getByTestId('generate-sheet'));
    await screen.findByTestId('candidate-image');

    fireEvent.click(screen.getByTestId('approve-sheet'));
    fireEvent.change(screen.getByTestId('character-name'), {
      target: { value: 'Anna' },
    });
    fireEvent.change(screen.getByTestId('character-handle'), {
      target: { value: 'anna' },
    });
    fireEvent.click(screen.getByTestId('create-character'));

    await waitFor(() => {
      expect(mocks.createFromSheet).toHaveBeenCalledWith({
        assetId: 'img-1',
        handle: 'anna',
        label: 'Anna',
      });
    });
  });

  describe('shared characters', () => {
    const sharedCharacter = {
      availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
      availableBrandCount: 3,
      availableBrandIds: [],
      handle: 'anna',
      id: 'p1',
      isShared: true,
      label: 'Anna',
      owningBrandId: 'brand-2',
      owningBrandName: 'Podcast',
    };
    const privateCharacter = {
      availabilityMode: PersonaAvailabilityMode.OWNING_BRAND,
      availableBrandCount: 1,
      availableBrandIds: [],
      handle: 'ben',
      id: 'p2',
      isShared: false,
      label: 'Ben',
      owningBrandId: 'brand-1',
      owningBrandName: 'Personal brand',
    };

    it('shows a shared badge with the owning brand and brand count', async () => {
      mocks.listCharacters.mockResolvedValue([
        sharedCharacter,
        privateCharacter,
      ]);
      render(<LibraryCharactersPage />);

      expect(
        await screen.findByText('Shared · Podcast · 3 brands'),
      ).toBeInTheDocument();
      expect(screen.getAllByText('Shared', { exact: false })).toHaveLength(1);
    });

    it('hides availability controls from members who are not owners or admins', async () => {
      mocks.listCharacters.mockResolvedValue([sharedCharacter]);
      render(<LibraryCharactersPage />);

      await screen.findByText('Shared · Podcast · 3 brands');
      expect(
        screen.queryByRole('button', { name: 'Manage availability for Anna' }),
      ).not.toBeInTheDocument();
    });

    it('lets an admin change availability to all brands in one action', async () => {
      mocks.role = MemberRole.ADMIN;
      mocks.listCharacters.mockResolvedValue([privateCharacter]);
      render(<LibraryCharactersPage />);

      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Manage availability for Ben',
        }),
      );
      fireEvent.click(await screen.findByRole('radio', { name: /All brands/ }));
      fireEvent.click(screen.getByTestId('save-availability'));

      await waitFor(() => {
        expect(mocks.updateAvailability).toHaveBeenCalledWith('p2', {
          brandIds: [],
          mode: PersonaAvailabilityMode.ALL_BRANDS,
        });
      });
    });

    describe('granting to another organization (#6037)', () => {
      const organizations = [
        {
          brands: [
            { id: 'brand-x', label: 'Show' },
            { id: 'brand-y', label: 'Clips' },
          ],
          id: 'org-2',
          label: 'ShipShit Show',
        },
      ];

      it('shows a Granted by badge and no manage control for a granted character', async () => {
        mocks.role = MemberRole.ADMIN;
        mocks.listCharacters.mockResolvedValue([
          {
            ...sharedCharacter,
            grantedByOrganizationName: 'Vincent Shipshit',
            id: 'pg',
            isGranted: true,
            isShared: false,
            label: 'Granted Gina',
          },
        ]);
        render(<LibraryCharactersPage />);

        expect(
          await screen.findByText('Granted by Vincent Shipshit'),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('button', {
            name: 'Manage availability for Granted Gina',
          }),
        ).not.toBeInTheDocument();
      });

      it('grants an owned character to an administered organization for selected brands', async () => {
        mocks.role = MemberRole.OWNER;
        mocks.listCharacters.mockResolvedValue([privateCharacter]);
        mocks.listGrantableOrganizations.mockResolvedValue(organizations);
        render(<LibraryCharactersPage />);

        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Manage availability for Ben',
          }),
        );
        fireEvent.click(
          await screen.findByRole('radio', { name: 'ShipShit Show' }),
        );
        fireEvent.click(
          await screen.findByRole('radio', { name: 'Selected brands' }),
        );
        expect(screen.getByTestId('grant-character')).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show' }));
        fireEvent.click(screen.getByTestId('grant-character'));

        await waitFor(() => {
          expect(mocks.grantToOrganization).toHaveBeenCalledWith('p2', {
            brandIds: ['brand-x'],
            mode: PersonaAvailabilityMode.SELECTED_BRANDS,
            recipientOrganizationId: 'org-2',
          });
        });
      });

      it('lists active grants and revokes one', async () => {
        mocks.role = MemberRole.OWNER;
        mocks.listCharacters.mockResolvedValue([privateCharacter]);
        mocks.listGrants.mockResolvedValue([
          {
            availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
            availableBrandIds: [],
            grantedAt: '2026-10-04T00:00:00.000Z',
            id: 'grant-1',
            recipientOrganizationId: 'org-2',
            recipientOrganizationName: 'ShipShit Show',
          },
        ]);
        render(<LibraryCharactersPage />);

        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Manage availability for Ben',
          }),
        );
        expect(await screen.findByTestId('grants-list')).toHaveTextContent(
          'ShipShit Show',
        );
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Revoke the grant to ShipShit Show',
          }),
        );

        await waitFor(() => {
          expect(mocks.revokeGrant).toHaveBeenCalledWith('p2', 'grant-1');
        });
      });

      it('offers no grant control when the member administers no other organization', async () => {
        mocks.role = MemberRole.OWNER;
        mocks.listCharacters.mockResolvedValue([privateCharacter]);
        render(<LibraryCharactersPage />);

        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Manage availability for Ben',
          }),
        );
        await screen.findByTestId('character-availability');

        expect(
          screen.queryByTestId('character-grants'),
        ).not.toBeInTheDocument();
      });
    });

    it('lets an admin move a shared character to another brand it is available to', async () => {
      mocks.role = MemberRole.ADMIN;
      mocks.listCharacters.mockResolvedValue([sharedCharacter]);
      render(<LibraryCharactersPage />);

      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Manage availability for Anna',
        }),
      );
      expect(screen.getByTestId('move-ownership')).toBeDisabled();
      fireEvent.click(await screen.findByRole('radio', { name: 'Newsletter' }));
      fireEvent.click(screen.getByTestId('move-ownership'));

      await waitFor(() => {
        expect(mocks.moveOwnership).toHaveBeenCalledWith('p1', 'brand-3');
      });
    });

    it('does not offer an ownership move for a character owned by one brand', async () => {
      mocks.role = MemberRole.ADMIN;
      mocks.listCharacters.mockResolvedValue([privateCharacter]);
      render(<LibraryCharactersPage />);

      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Manage availability for Ben',
        }),
      );
      await screen.findByTestId('character-availability');

      expect(
        screen.queryByTestId('character-ownership'),
      ).not.toBeInTheDocument();
    });

    it('offers selected brands with the owning brand locked on', async () => {
      mocks.role = MemberRole.OWNER;
      mocks.listCharacters.mockResolvedValue([sharedCharacter]);
      render(<LibraryCharactersPage />);

      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Manage availability for Anna',
        }),
      );
      fireEvent.click(
        await screen.findByRole('radio', { name: /Selected brands/ }),
      );

      expect(
        screen.getByRole('checkbox', { name: 'Podcast (owner)' }),
      ).toBeDisabled();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Newsletter' }));
      fireEvent.click(screen.getByTestId('save-availability'));

      await waitFor(() => {
        expect(mocks.updateAvailability).toHaveBeenCalledWith('p1', {
          brandIds: ['brand-3'],
          mode: PersonaAvailabilityMode.SELECTED_BRANDS,
        });
      });
    });

    it('sends the availability choice when an admin creates from a sheet', async () => {
      mocks.role = MemberRole.ADMIN;
      render(<LibraryCharactersPage />);

      fireEvent.click(await screen.findByText('New character'));
      await screen.findByTestId('character-description');
      fireEvent.change(screen.getByTestId('character-description'), {
        target: { value: 'a tall woman' },
      });
      fireEvent.click(screen.getByTestId('generate-sheet'));
      await screen.findByTestId('candidate-image');
      fireEvent.click(screen.getByTestId('approve-sheet'));
      fireEvent.change(screen.getByTestId('character-name'), {
        target: { value: 'Anna' },
      });
      fireEvent.change(screen.getByTestId('character-handle'), {
        target: { value: 'anna' },
      });
      fireEvent.click(screen.getByRole('radio', { name: /All brands/ }));
      fireEvent.click(screen.getByTestId('create-character'));

      await waitFor(() => {
        expect(mocks.createFromSheet).toHaveBeenCalledWith({
          assetId: 'img-1',
          availability: {
            brandIds: [],
            mode: PersonaAvailabilityMode.ALL_BRANDS,
          },
          handle: 'anna',
          label: 'Anna',
        });
      });
    });

    it('does not offer availability to non-admins creating a character', async () => {
      render(<LibraryCharactersPage />);

      fireEvent.click(await screen.findByText('New character'));
      await screen.findByTestId('character-description');
      fireEvent.change(screen.getByTestId('character-description'), {
        target: { value: 'a tall woman' },
      });
      fireEvent.click(screen.getByTestId('generate-sheet'));
      await screen.findByTestId('candidate-image');
      fireEvent.click(screen.getByTestId('approve-sheet'));

      expect(
        screen.queryByTestId('character-availability'),
      ).not.toBeInTheDocument();
    });
  });
});
