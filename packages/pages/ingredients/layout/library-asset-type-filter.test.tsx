import LibraryAssetTypeFilter from '@pages/ingredients/layout/library-asset-type-filter';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@ui/buttons/dropdown/button-dropdown/ButtonDropdown', () => ({
  default: ({
    onChange,
    options,
    value,
  }: {
    onChange: (name: string, value: string) => void;
    options: readonly { label: string; value: string }[];
    value: string;
  }) => (
    <button
      type="button"
      data-options={options.map((option) => option.label).join(',')}
      data-value={value}
      onClick={() => onChange('assetType', 'images')}
    >
      Change asset type
    </button>
  ),
}));

describe('LibraryAssetTypeFilter', () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it('treats the route type as a filter and keeps cross-type context', () => {
    render(<LibraryAssetTypeFilter />);

    const trigger = screen.getByRole('button', {
      name: 'Change asset type',
    });
    expect(trigger).toHaveAttribute('data-value', 'videos');
    expect(trigger).toHaveAttribute(
      'data-options',
      'Videos,Images,GIFs,Avatars,Voices,Music,Captions',
    );

    fireEvent.click(trigger);

    expect(replaceMock).toHaveBeenCalledWith(
      '/acme/moonrise/library/images?folder=folder-1&taskId=task-1',
      { scroll: false },
    );
  });
});
