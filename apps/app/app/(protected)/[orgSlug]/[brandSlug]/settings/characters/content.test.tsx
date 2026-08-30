// @vitest-environment jsdom
'use client';

import { IngredientStatus } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsCharactersPage from './content';

const mocks = vi.hoisted(() => {
  const composeSheetPrompt = vi.fn();
  const createFromSheet = vi.fn();
  const listCharacters = vi.fn();
  const postImage = vi.fn();
  const personasService = {
    composeSheetPrompt,
    createFromSheet,
    listCharacters,
  };
  const imagesService = { post: postImage };
  return {
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
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.characters');
  return {
    useTranslations: () => translate,
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
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
      listCharacters: mocks.listCharacters,
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

describe('BrandSettingsCharactersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCharacters.mockResolvedValue([]);
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

  it('renders section chrome and the create wizard while the character list loads', async () => {
    let resolveListCharacters!: (rows: Array<unknown>) => void;
    mocks.listCharacters.mockReturnValue(
      new Promise((resolve) => {
        resolveListCharacters = resolve;
      }),
    );

    render(<BrandSettingsCharactersPage />);

    // Chrome renders immediately: title card and create-wizard fields don't
    // wait on the character list.
    expect(screen.getByText('Characters')).toBeInTheDocument();
    expect(screen.getByTestId('character-description')).toBeInTheDocument();
    expect(screen.getByTestId('characters-list-loading')).toBeInTheDocument();

    resolveListCharacters([]);
    await waitFor(() => {
      expect(
        screen.queryByTestId('characters-list-loading'),
      ).not.toBeInTheDocument();
    });
  });

  it('generates a sheet from the description using the server preset', async () => {
    render(<BrandSettingsCharactersPage />);

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
    render(<BrandSettingsCharactersPage />);

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
    render(<BrandSettingsCharactersPage />);

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
});
