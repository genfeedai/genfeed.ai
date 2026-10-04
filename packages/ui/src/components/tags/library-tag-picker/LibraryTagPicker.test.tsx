import { TagScope } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LibraryTagPicker from './LibraryTagPicker';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/primitives/popover', () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  PopoverPanelContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@ui/primitives/command', () => ({
  Command: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children?: React.ReactNode }) => (
    <p>{children}</p>
  ),
  CommandGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: ({
    onValueChange,
    placeholder,
    value,
  }: {
    onValueChange?: (value: string) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      aria-label="Search or create a tag"
      onChange={(event) => onValueChange?.(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  ),
  CommandItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <div
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onSelect?.();
        }
      }}
      onKeyDown={() => undefined}
      role="option"
      tabIndex={-1}
    >
      {children}
    </div>
  ),
  CommandList: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const launch = {
  assetCount: 4,
  backgroundColor: '#000000',
  id: 'tag-launch',
  label: 'Launch',
  scope: TagScope.BRAND,
  textColor: '#ffffff',
} as ITag;
const episode = {
  assetCount: 12,
  backgroundColor: '#112233',
  id: 'tag-episode',
  label: 'S1E12',
  scope: TagScope.ORGANIZATION,
  textColor: '#ffffff',
} as ITag;
const enhanced = {
  assetCount: 0,
  backgroundColor: '#444444',
  id: 'tag-enhanced',
  label: 'enhanced',
  scope: TagScope.GLOBAL,
  textColor: '#ffffff',
} as ITag;

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof LibraryTagPicker>> = {},
) {
  const props = {
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    tags: [launch, episode, enhanced],
    trigger: <button type="button">Add tag</button>,
    ...overrides,
  };
  render(<LibraryTagPicker {...props} />);
  return props;
}

describe('LibraryTagPicker', () => {
  it('lists each tag with its asset count and where it is visible', () => {
    renderPicker();

    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('S1E12')).toBeInTheDocument();
    expect(screen.getByText('All brands')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('toggles a tag with the state it currently has on the targeted assets', () => {
    const { onToggle } = renderPicker({
      states: new Map<string, 'all' | 'some'>([['tag-episode', 'all']]),
    });

    fireEvent.click(screen.getByText('Launch'));
    expect(onToggle).toHaveBeenLastCalledWith(launch, undefined);

    fireEvent.click(screen.getByText('S1E12'));
    expect(onToggle).toHaveBeenLastCalledWith(episode, 'all');
  });

  it('says in words whether a tag is on every or only some targeted assets', () => {
    renderPicker({
      states: new Map<string, 'all' | 'some'>([
        ['tag-launch', 'some'],
        ['tag-episode', 'all'],
      ]),
    });

    expect(screen.getByText('On every selected asset')).toBeInTheDocument();
    expect(screen.getByText('On some selected assets')).toBeInTheDocument();
  });

  it('offers to create a label that matches no tag, and passes it trimmed', () => {
    const { onCreate } = renderPicker();

    fireEvent.change(screen.getByLabelText('Search or create a tag'), {
      target: { value: '  Spring drop  ' },
    });
    fireEvent.click(screen.getByText('Create “Spring drop”'));

    expect(onCreate).toHaveBeenCalledWith('Spring drop');
    expect(screen.getByLabelText('Search or create a tag')).toHaveValue('');
  });

  it('does not offer to create a duplicate, however it is cased', () => {
    renderPicker();

    fireEvent.change(screen.getByLabelText('Search or create a tag'), {
      target: { value: 'launch' },
    });

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('offers nothing to create until something is typed', () => {
    renderPicker();

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('guides the first tag with what tags are for and what is already a filter', () => {
    renderPicker({ tags: [] });

    expect(
      screen.getByText(/campaign, series, episode, mood or client/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Type, origin and folder are already filters/),
    ).toBeInTheDocument();
  });

  it('reminds creators of the vocabulary once tags exist', () => {
    renderPicker();

    expect(
      screen.getByText(
        'Tags are for campaign, series, episode, mood or client. Type, origin and folder are already filters.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a loading state instead of an empty list', () => {
    renderPicker({ isLoading: true, tags: [] });

    expect(screen.getByRole('status')).toHaveTextContent('Loading tags…');
    expect(screen.queryByText('Launch')).not.toBeInTheDocument();
  });

  it('ignores selecting and creating while a write is in flight', () => {
    const { onCreate, onToggle } = renderPicker({ isBusy: true });

    fireEvent.click(screen.getByText('Launch'));
    fireEvent.change(screen.getByLabelText('Search or create a tag'), {
      target: { value: 'New one' },
    });
    fireEvent.click(screen.getByText('Create “New one”'));

    expect(onToggle).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
