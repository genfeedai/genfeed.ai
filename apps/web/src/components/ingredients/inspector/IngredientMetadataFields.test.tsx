import { LIBRARY_ASSET_METADATA_EVENT } from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  ILibraryAssetMetadataChange,
} from '@genfeedai/contracts/interfaces';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientMetadataFields from './IngredientMetadataFields';
import {
  applyLibraryAssetMetadataChange,
  requestLibraryAssetRename,
} from './library-asset-metadata-event';

const { notifications, patchMetadata } = vi.hoisted(() => ({
  notifications: { error: vi.fn(), success: vi.fn() },
  patchMetadata: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { default: library } = await import(
    '../../../../messages/en/pages/library.json'
  );
  return {
    useTranslations: createTranslateFromCatalog({ pages: { library } }),
  };
});

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ patchMetadata }),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const sunset = {
  id: 'asset-1',
  metadata: { description: 'Golden hour', label: 'Sunset' },
} as unknown as IIngredient;

/** Stands in for the Library list: it applies saved edits to its row. */
function LibraryRow({ ingredient }: { ingredient: IIngredient }) {
  const [rows, setRows] = useState([ingredient]);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const change = (event as CustomEvent<ILibraryAssetMetadataChange>).detail;
      setRows((current) => applyLibraryAssetMetadataChange(current, change));
    };
    window.addEventListener(LIBRARY_ASSET_METADATA_EVENT, handleChange);
    return () =>
      window.removeEventListener(LIBRARY_ASSET_METADATA_EVENT, handleChange);
  }, []);

  return <IngredientMetadataFields ingredient={rows[0]} />;
}

describe('IngredientMetadataFields', () => {
  beforeEach(() => {
    patchMetadata.mockReset();
    patchMetadata.mockResolvedValue({});
    notifications.error.mockReset();
  });

  it('renames the asset with Enter and shows the new name', async () => {
    const user = userEvent.setup();
    render(<LibraryRow ingredient={sunset} />);

    await user.click(screen.getByRole('button', { name: 'Asset name' }));
    const field = screen.getByRole('textbox', { name: 'Asset name' });
    await user.clear(field);
    await user.type(field, '  Sunset final  {Enter}');

    expect(
      await screen.findByRole('button', { name: 'Asset name' }),
    ).toHaveTextContent('Sunset final');
    expect(patchMetadata).toHaveBeenCalledWith('asset-1', {
      label: 'Sunset final',
    });
  });

  it('keeps the old name when Escape cancels the edit', async () => {
    const user = userEvent.setup();
    render(<LibraryRow ingredient={sunset} />);

    await user.click(screen.getByRole('button', { name: 'Asset name' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Asset name' }),
      ' draft{Escape}',
    );

    expect(
      screen.getByRole('button', { name: 'Asset name' }),
    ).toHaveTextContent('Sunset');
    expect(patchMetadata).not.toHaveBeenCalled();
  });

  it('does not save an empty name', async () => {
    const user = userEvent.setup();
    render(<LibraryRow ingredient={sunset} />);

    await user.click(screen.getByRole('button', { name: 'Asset name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Asset name' }));
    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('button', { name: 'Asset name' }),
    ).toHaveTextContent('Sunset');
    expect(patchMetadata).not.toHaveBeenCalled();
  });

  it('keeps the old name and says so when the save fails', async () => {
    patchMetadata.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<LibraryRow ingredient={sunset} />);

    await user.click(screen.getByRole('button', { name: 'Asset name' }));
    const field = screen.getByRole('textbox', { name: 'Asset name' });
    await user.clear(field);
    await user.type(field, 'Dusk{Enter}');

    expect(
      await screen.findByRole('button', { name: 'Asset name' }),
    ).toHaveTextContent('Sunset');
    expect(notifications.error).toHaveBeenCalledWith(
      'Could not rename this asset. Try again.',
    );
  });

  it('saves the description when the field is left', async () => {
    const user = userEvent.setup();
    render(<LibraryRow ingredient={sunset} />);

    await user.click(screen.getByRole('button', { name: 'Description' }));
    const field = screen.getByRole('textbox', { name: 'Description' });
    await user.clear(field);
    await user.type(field, 'Blue hour');
    await user.tab();

    expect(
      await screen.findByRole('button', { name: 'Description' }),
    ).toHaveTextContent('Blue hour');
  });

  it('opens the name field for a Rename asked for before it mounted', () => {
    requestLibraryAssetRename('asset-1');

    render(<LibraryRow ingredient={sunset} />);

    expect(screen.getByRole('textbox', { name: 'Asset name' })).toHaveValue(
      'Sunset',
    );
  });

  it('opens the name field for a Rename of this asset only', () => {
    render(<LibraryRow ingredient={sunset} />);

    act(() => requestLibraryAssetRename('asset-2'));
    expect(screen.queryByRole('textbox', { name: 'Asset name' })).toBeNull();

    act(() => requestLibraryAssetRename('asset-1'));
    expect(screen.getByRole('textbox', { name: 'Asset name' })).toHaveValue(
      'Sunset',
    );
  });
});
