import { TagScope } from '@genfeedai/contracts';
import { LIBRARY_TAG_UPDATED_EVENT } from '@genfeedai/contracts/constants';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createContext, useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryTagManagerDialog from './LibraryTagManagerDialog';

const { createTag, notifications, refresh, tagsService, libraryTags } =
  vi.hoisted(() => ({
    createTag: vi.fn(),
    libraryTags: { isLoading: false, tags: [] as unknown[] },
    notifications: { error: vi.fn(), success: vi.fn() },
    refresh: vi.fn(),
    tagsService: { patch: vi.fn(), removeTag: vi.fn() },
  }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => tagsService,
}));

vi.mock('@genfeedai/services/content/tags.service', () => ({
  TagsService: { getInstance: () => tagsService },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));

vi.mock('./use-library-tags', () => ({
  useLibraryTags: () => ({
    createTag,
    isLoading: libraryTags.isLoading,
    refresh,
    tags: libraryTags.tags,
  }),
}));

const SelectValueContext = createContext<(value: string) => void>(() => {});

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children?: React.ReactNode;
    onValueChange?: (value: string) => void;
  }) => (
    <SelectValueContext.Provider value={onValueChange ?? (() => {})}>
      <div>{children}</div>
    </SelectValueContext.Provider>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: function SelectItemMock({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value: string;
  }) {
    const onValueChange = useContext(SelectValueContext);
    return (
      <button onClick={() => onValueChange(value)} role="option" type="button">
        {children}
      </button>
    );
  },
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));

vi.mock('@ui/primitives/editable-text', () => ({
  EditableText: ({
    ariaLabel,
    onSave,
    value,
  }: {
    ariaLabel: string;
    onSave: (value: string) => Promise<void> | void;
    value?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      onClick={() => {
        // Mirrors the real primitive, which catches a refused save and reverts.
        void Promise.resolve(onSave(`${value} renamed`)).catch(() => undefined);
      }}
      type="button"
    >
      {value}
    </button>
  ),
}));

const brandTag = {
  assetCount: 4,
  backgroundColor: '#000000',
  id: 'tag-brand',
  label: 'Launch',
  scope: TagScope.BRAND,
  textColor: '#ffffff',
} as ITag;
const orgTag = {
  assetCount: 12,
  backgroundColor: '#112233',
  id: 'tag-org',
  label: 'S1E12',
  scope: TagScope.ORGANIZATION,
  textColor: '#ffffff',
} as ITag;
const defaultTag = {
  assetCount: 0,
  backgroundColor: '#444444',
  id: 'tag-default',
  label: 'enhanced',
  scope: TagScope.GLOBAL,
  textColor: '#ffffff',
} as ITag;

function open() {
  render(<LibraryTagManagerDialog />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }));
}

describe('LibraryTagManagerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    libraryTags.isLoading = false;
    libraryTags.tags = [brandTag, orgTag, defaultTag];
    tagsService.patch.mockResolvedValue({});
    tagsService.removeTag.mockResolvedValue(undefined);
    refresh.mockResolvedValue(undefined);
  });

  it('lists tags with where they are visible and how many assets carry them', () => {
    open();

    expect(screen.getByText('This brand · 4')).toBeInTheDocument();
    expect(screen.getByText('All brands · 12')).toBeInTheDocument();
    expect(screen.getByText('Default · 0')).toBeInTheDocument();
  });

  it('lists legacy default tags read-only, with no controls', () => {
    open();

    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rename tag enhanced' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete tag enhanced' }),
    ).not.toBeInTheDocument();
  });

  it('renames a tag and tells the Library so cards pick it up', async () => {
    const updated = vi.fn();
    window.addEventListener(LIBRARY_TAG_UPDATED_EVENT, updated);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Rename tag Launch' }));

    await waitFor(() =>
      expect(tagsService.patch).toHaveBeenCalledWith('tag-brand', {
        label: 'Launch renamed',
      }),
    );
    await waitFor(() => expect(updated).toHaveBeenCalled());
    const [event] = updated.mock.calls[0] as [CustomEvent<ITag>];
    expect(event.detail).toMatchObject({
      id: 'tag-brand',
      label: 'Launch renamed',
    });
    expect(refresh).toHaveBeenCalled();
    window.removeEventListener(LIBRARY_TAG_UPDATED_EVENT, updated);
  });

  it('recolors a tag from the palette, with a text color that reads on it', async () => {
    const updated = vi.fn();
    window.addEventListener(LIBRARY_TAG_UPDATED_EVENT, updated);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Color of Launch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Blue' }));

    await waitFor(() =>
      expect(tagsService.patch).toHaveBeenCalledWith('tag-brand', {
        backgroundColor: '#2563EB',
        textColor: '#FFFFFF',
      }),
    );
    await waitFor(() => expect(updated).toHaveBeenCalled());
    window.removeEventListener(LIBRARY_TAG_UPDATED_EVENT, updated);
  });

  it('asks twice before deleting, then keeps the assets', async () => {
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Delete tag Launch' }));
    expect(tagsService.removeTag).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm deleting tag Launch' }),
    );

    await waitFor(() =>
      expect(tagsService.removeTag).toHaveBeenCalledWith('tag-brand'),
    );
    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith(
        'Deleted “Launch”. Its assets are untouched.',
      ),
    );
  });

  it('says so when a change is refused', async () => {
    tagsService.patch.mockRejectedValue(new Error('403'));
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Rename tag S1E12' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        expect.stringContaining('owner or admin'),
      ),
    );
  });

  it('creates a brand tag by default', async () => {
    createTag.mockResolvedValue(brandTag);
    open();

    fireEvent.change(screen.getByLabelText('New tag name'), {
      target: { value: '  Spring drop ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(createTag).toHaveBeenCalledWith('Spring drop', TagScope.BRAND),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('New tag name')).toHaveValue(''),
    );
  });

  it('explains that only an owner or admin can create an organization-wide tag', async () => {
    createTag.mockRejectedValue(new Error('403'));
    open();

    fireEvent.change(screen.getByLabelText('New tag name'), {
      target: { value: 'Everywhere' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'All brands' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'Only an organization owner or admin can create an organization-wide tag.',
      ),
    );
  });

  it('cannot create a blank tag', () => {
    open();

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('guides the first tag when the brand has none', () => {
    libraryTags.tags = [];
    open();

    expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
  });
});
