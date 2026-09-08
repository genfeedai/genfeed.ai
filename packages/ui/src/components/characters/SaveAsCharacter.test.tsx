import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import SaveAsCharacter from '@ui/characters/SaveAsCharacter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  inspect: vi.fn(),
  create: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org-1', brandId: 'brand-1' }),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    listCharacters: mocks.list,
    inspectImage: mocks.inspect,
    createFromSheet: mocks.create,
  }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ success: mocks.success }) },
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { handle?: string }) =>
    values?.handle ? `${key} ${values.handle}` : key,
}));
function mount(active = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SaveAsCharacter
        active={active}
        assetId="image-1"
        imageUrl="https://example.com/image.png"
      />
    </QueryClientProvider>,
  );
}
async function open() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'saveExisting.action' }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'saveExisting.action' }));
}
describe('SaveAsCharacter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
    mocks.inspect.mockResolvedValue({
      id: 'image-1',
      hasFace: true,
      isCharacter: true,
      characterId: null,
      handle: null,
      label: null,
    });
    mocks.create.mockResolvedValue({ id: 'character-1' });
  });
  it('saves the existing asset without regeneration, labels it, and refreshes mentions', async () => {
    const refresh = vi.fn();
    window.addEventListener('genfeed:characters:changed', refresh);
    mount();
    await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'fields.name' }), {
      target: { value: ' Anna ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'fields.handle' }), {
      target: { value: '@anna' },
    });
    mocks.list.mockResolvedValue([
      {
        id: 'character-1',
        avatarIngredientId: 'image-1',
        handle: 'anna',
        label: 'Anna',
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        assetId: 'image-1',
        handle: 'anna',
        label: 'Anna',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'saveExisting.saved anna' }),
    ).toBeDisabled();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    window.removeEventListener('genfeed:characters:changed', refresh);
  });
  it('shows the durable character label after remount without creating duplicates', async () => {
    mocks.list.mockResolvedValue([
      { id: 'character-1', avatarIngredientId: 'image-1', handle: 'anna' },
    ]);
    mount();
    expect(
      await screen.findByRole('button', { name: 'saveExisting.saved anna' }),
    ).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('validates the handle and retains form values after a failed save', async () => {
    mount();
    await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'fields.name' }), {
      target: { value: 'Anna' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'fields.handle' }), {
      target: { value: 'invalid handle' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('errors.invalidHandle');
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.create.mockRejectedValue(new Error('duplicate handle'));
    fireEvent.change(screen.getByRole('textbox', { name: 'fields.handle' }), {
      target: { value: 'anna' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('saveExisting.error'),
    );
    expect(screen.getByRole('textbox', { name: 'fields.name' })).toHaveValue(
      'Anna',
    );
  });
  it('prevents duplicate saves while the request is pending', async () => {
    let resolve: (() => void) | undefined;
    mocks.create.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    mount();
    await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'fields.name' }), {
      target: { value: 'Anna' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'fields.handle' }), {
      target: { value: 'anna' },
    });
    const save = screen.getByRole('button', { name: 'actions.save' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(save).toBeDisabled();
    await act(async () => resolve?.());
  });
  it('does not inspect images while their action menus are closed', async () => {
    mount(false);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it('waits for detection before offering the save action', async () => {
    let resolve:
      | ((value: { hasFace: boolean; isCharacter: boolean }) => void)
      | undefined;
    mocks.inspect.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledWith('image-1'));
    expect(
      screen.getByRole('button', { name: 'saveExisting.checking' }),
    ).toBeDisabled();
    await act(async () => resolve?.({ hasFace: false, isCharacter: true }));
    await open();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
  it('hides the action for an image without a face or character', async () => {
    mocks.inspect.mockResolvedValue({ hasFace: false, isCharacter: false });
    mount();
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('button')).not.toBeInTheDocument(),
    );
  });
  it('recognizes generated images already linked to a saved character', async () => {
    mocks.inspect.mockResolvedValue({
      hasFace: null,
      isCharacter: null,
      characterId: 'character-1',
      handle: 'anna',
      label: 'Anna',
    });
    mount();
    expect(
      await screen.findByRole('button', { name: 'saveExisting.saved anna' }),
    ).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('skips image detection for a known saved reference', async () => {
    mocks.list.mockResolvedValue([
      { id: 'character-1', avatarIngredientId: 'image-1', handle: 'anna' },
    ]);
    mount();
    await screen.findByRole('button', { name: 'saveExisting.saved anna' });
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'error'])(
    'allows manual saving when detection is %s',
    async (result) => {
      if (result === 'error')
        mocks.inspect.mockRejectedValue(new Error('unavailable'));
      else
        mocks.inspect.mockResolvedValue({
          hasFace: null,
          isCharacter: null,
          characterId: null,
        });
      mount();
      await open();
      expect(
        screen.getByText('saveExisting.inspectionUnavailable'),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'actions.save' }),
      ).toBeEnabled();
    },
  );
  it('shows a safe label for a legacy character without a handle', async () => {
    mocks.list.mockResolvedValue([
      {
        id: 'character-1',
        avatarIngredientId: 'image-1',
        handle: null,
        label: null,
      },
    ]);
    mount();
    expect(
      await screen.findByRole('button', {
        name: 'saveExisting.savedWithoutHandle',
      }),
    ).toBeDisabled();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
