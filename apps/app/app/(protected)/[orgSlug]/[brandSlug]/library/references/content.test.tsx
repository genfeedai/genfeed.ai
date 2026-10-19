// @vitest-environment jsdom
'use client';

import {
  IngredientStatus,
  MemberRole,
  PersonaAvailabilityMode,
} from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryCharactersPage from './content';

const mocks = vi.hoisted(() => {
  const composeSheetPrompt = vi.fn();
  const createFromSheet = vi.fn();
  const listCharacters = vi.fn();
  const updateAvailability = vi.fn();
  const moveOwnership = vi.fn();
  const listGrants = vi.fn();
  const addReferences = vi.fn();
  const removeReference = vi.fn();
  const reorderReferences = vi.fn();
  const openGallery = vi.fn();
  const listGrantableOrganizations = vi.fn();
  const grantToOrganization = vi.fn();
  const revokeGrant = vi.fn();
  const postImage = vi.fn();
  const personasService = {
    addReferences,
    composeSheetPrompt,
    createFromSheet,
    grantToOrganization,
    listCharacters,
    listGrantableOrganizations,
    listGrants,
    moveOwnership,
    removeReference,
    reorderReferences,
    revokeGrant,
    updateAvailability,
  };
  const imagesService = { post: postImage };
  return {
    addReferences,
    openGallery,
    removeReference,
    reorderReferences,
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

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: () => ({
      closeGallery: vi.fn(),
      openGallery: mocks.openGallery,
    }),
  }),
);

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

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/library/references',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
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
      addReferences: mocks.addReferences,
      composeSheetPrompt: mocks.composeSheetPrompt,
      createFromSheet: mocks.createFromSheet,
      grantToOrganization: mocks.grantToOrganization,
      listCharacters: mocks.listCharacters,
      listGrantableOrganizations: mocks.listGrantableOrganizations,
      listGrants: mocks.listGrants,
      moveOwnership: mocks.moveOwnership,
      removeReference: mocks.removeReference,
      reorderReferences: mocks.reorderReferences,
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

    // #5502: the page is Library References; characters are its first type.
    expect(
      screen.getByRole('heading', { level: 1, name: 'References' }),
    ).toBeInTheDocument();

    resolveListCharacters([]);
    await waitFor(() => {
      expect(screen.getByText('References')).toBeInTheDocument();
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
      referenceIngredientIds: [],
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
      referenceIngredientIds: [],
    };

    it('pages the character list from the server', async () => {
      mocks.listCharacters.mockResolvedValue([privateCharacter]);
      render(<LibraryCharactersPage />);

      expect(await screen.findByText('Ben')).toBeVisible();
      expect(
        screen.getByRole('navigation', { name: 'pagination' }),
      ).toBeVisible();
      expect(mocks.listCharacters).toHaveBeenCalledWith(
        { limit: ITEMS_PER_PAGE, page: 1 },
        expect.any(AbortSignal),
      );
    });

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

  describe('managing reference images (#7004)', () => {
    const anna = {
      avatarIngredientId: 'img-a',
      handle: 'anna',
      id: 'p1',
      label: 'Anna',
      referenceIngredientIds: ['img-a', 'img-b'],
    };

    async function openManageDialog() {
      render(<LibraryCharactersPage />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Manage references for Anna',
        }),
      );
      return screen.findByRole('dialog');
    }

    function referenceOrder(dialog: HTMLElement): string[] {
      return within(dialog)
        .getAllByText(/^Reference \d+ of Anna$/)
        .map((image) => image.getAttribute('data-src') ?? '');
    }

    it('shows the ordered reference thumbnails on the row', async () => {
      mocks.listCharacters.mockResolvedValue([anna]);
      render(<LibraryCharactersPage />);

      await screen.findByText('@anna');
      expect(
        screen
          .getAllByText(/^Reference \d+ of Anna$/)
          .map((image) => image.getAttribute('data-src')),
      ).toEqual([
        'https://cdn.test/ingredients/images/img-a',
        'https://cdn.test/ingredients/images/img-b',
      ]);
    });

    it('persists a new order and promotes the first reference to primary', async () => {
      mocks.listCharacters.mockResolvedValue([anna]);
      mocks.reorderReferences.mockResolvedValue([
        { ingredientId: 'img-b', position: 0 },
        { ingredientId: 'img-a', position: 1 },
      ]);
      const dialog = await openManageDialog();

      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Move reference 2 up' }),
      );

      await waitFor(() =>
        expect(mocks.reorderReferences).toHaveBeenCalledWith('p1', [
          'img-b',
          'img-a',
        ]),
      );
      await waitFor(() =>
        expect(referenceOrder(dialog)).toEqual([
          'https://cdn.test/ingredients/images/img-b',
          'https://cdn.test/ingredients/images/img-a',
        ]),
      );
    });

    it('removes a reference and keeps the next one as primary', async () => {
      mocks.listCharacters.mockResolvedValue([anna]);
      mocks.removeReference.mockResolvedValue([
        { ingredientId: 'img-b', position: 0 },
      ]);
      const dialog = await openManageDialog();

      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Remove reference 1' }),
      );

      await waitFor(() =>
        expect(mocks.removeReference).toHaveBeenCalledWith('p1', 'img-a'),
      );
      await waitFor(() =>
        expect(referenceOrder(dialog)).toEqual([
          'https://cdn.test/ingredients/images/img-b',
        ]),
      );
      expect(
        within(dialog).getByRole('button', { name: 'Remove reference 1' }),
      ).toBeDisabled();
    });

    it('appends images picked from the Library', async () => {
      mocks.listCharacters.mockResolvedValue([anna]);
      mocks.addReferences.mockResolvedValue([
        { ingredientId: 'img-a', position: 0 },
        { ingredientId: 'img-b', position: 1 },
        { ingredientId: 'img-c', position: 2 },
      ]);
      const dialog = await openManageDialog();

      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Add from Library' }),
      );

      expect(mocks.openGallery).toHaveBeenCalledWith(
        expect.objectContaining({ maxSelectableItems: 12 }),
      );
      const { onSelect } = mocks.openGallery.mock.calls[0][0] as {
        onSelect: (items: Array<{ id: string; isDeleted?: boolean }>) => void;
      };
      onSelect([
        { id: 'img-b' },
        { id: 'img-c' },
        { id: 'img-d', isDeleted: true },
      ]);

      await waitFor(() =>
        expect(mocks.addReferences).toHaveBeenCalledWith('p1', ['img-c']),
      );
      await waitFor(() => expect(referenceOrder(dialog)).toHaveLength(3));
    });

    it('explains the 14 image limit instead of adding more', async () => {
      mocks.listCharacters.mockResolvedValue([
        {
          ...anna,
          referenceIngredientIds: Array.from(
            { length: 14 },
            (_, index) => `img-${index}`,
          ),
        },
      ]);
      const dialog = await openManageDialog();

      expect(
        within(dialog).getByText(
          'A character can have up to 14 reference images. Remove one to add another.',
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'Add from Library' }),
      ).toBeDisabled();
      expect(mocks.openGallery).not.toHaveBeenCalled();
    });

    it('does not offer reference management for a granted character', async () => {
      mocks.listCharacters.mockResolvedValue([
        { ...anna, grantedByOrganizationName: 'Acme', isGranted: true },
      ]);
      render(<LibraryCharactersPage />);

      await screen.findByText('@anna');
      expect(
        screen.queryByRole('button', { name: 'Manage references for Anna' }),
      ).not.toBeInTheDocument();
    });
  });
});
