import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryAssetTypeFilter from '@/features/ingredients/layout/library-asset-type-filter';

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/moonrise/library/videos',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () =>
    new URLSearchParams(
      'folder=folder-1&status=generated&format=portrait&taskId=task-1',
    ),
}));

describe('LibraryAssetTypeFilter', () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it('treats the route type as a filter and keeps cross-type context', async () => {
    const user = userEvent.setup();
    render(<LibraryAssetTypeFilter />);

    const trigger = screen.getByRole('combobox', {
      name: 'Filter by asset type',
    });
    expect(trigger).toHaveTextContent('Videos');

    await user.click(trigger);
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'Videos',
      'Images',
      'GIFs',
      'Avatars',
      'Voices',
      'Music',
      'Captions',
    ]);

    await user.click(screen.getByRole('option', { name: 'Images' }));

    expect(replaceMock).toHaveBeenCalledWith(
      '/acme/moonrise/library/images?folder=folder-1&taskId=task-1',
      { scroll: false },
    );
  });
});
