import { ModelCategory, ModelProvider, RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/command', async () => {
  const React = await import('react');

  return {
    Command: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
    CommandEmpty: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    CommandGroup: ({
      children,
      heading,
    }: {
      children: React.ReactNode;
      heading?: React.ReactNode;
    }) => (
      <section>
        {heading ? <div>{heading}</div> : null}
        {children}
      </section>
    ),
    CommandInput: ({
      className,
      onValueChange,
      placeholder,
      value,
    }: {
      className?: string;
      onValueChange?: (value: string) => void;
      placeholder?: string;
      value?: string;
    }) => (
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      />
    ),
    CommandItem: ({
      'aria-label': ariaLabel,
      children,
      onSelect,
      value,
    }: {
      'aria-label'?: string;
      children: React.ReactNode;
      onSelect?: (value: string) => void;
      value?: string;
    }) => (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => onSelect?.(value ?? '')}
      >
        {children}
      </button>
    ),
    CommandList: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

vi.mock('@ui/primitives/popover', async () => {
  const React = await import('react');

  return {
    Popover: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <div data-open={open}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, {
                __popoverOpen: open,
                __setPopoverOpen: onOpenChange,
              })
            : child,
        )}
      </div>
    ),
    PopoverContent: ({
      children,
      className,
      __popoverOpen,
    }: {
      children: React.ReactNode;
      className?: string;
      __popoverOpen?: boolean;
    }) =>
      __popoverOpen ? (
        <div data-testid="model-selector-popover" className={className}>
          {children}
        </div>
      ) : null,
    PopoverTrigger: ({
      children,
      __setPopoverOpen,
    }: {
      children: React.ReactElement<{ onClick?: () => void }>;
      __setPopoverOpen?: (open: boolean) => void;
    }) =>
      React.cloneElement(children, {
        onClick: () => __setPopoverOpen?.(true),
      }),
  };
});

vi.mock('@ui/primitives/select', async () => {
  const React = await import('react');

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => (
      <div data-value={value}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, {
                __onValueChange: onValueChange,
                __selectValue: value,
              })
            : child,
        )}
      </div>
    ),
    SelectContent: ({
      children,
      __onValueChange,
    }: {
      children: React.ReactNode;
      __onValueChange?: (value: string) => void;
    }) => (
      <div>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, {
                __onValueChange,
              })
            : child,
        )}
      </div>
    ),
    SelectItem: ({
      children,
      value,
      __onValueChange,
    }: {
      children: React.ReactNode;
      value: string;
      __onValueChange?: (value: string) => void;
    }) => (
      <button type="button" onClick={() => __onValueChange?.(value)}>
        {children}
      </button>
    ),
    SelectTrigger: ({ children, ...props }: { children: React.ReactNode }) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
  };
});

vi.mock('@ui/primitives/tooltip', async () => {
  const React = await import('react');

  // The hover spec is covered in ModelSelectorModelItem.test.tsx with the real
  // Radix tooltip. Here it would only duplicate every model label in the tree.
  return {
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: () => null,
    TooltipProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

function createModel(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2026-01-01',
    id: overrides.key,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: overrides.key,
    label: overrides.label,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-01-01',
    ...overrides,
  } as IModel;
}

const catalogFilterFixtures = [
  createModel({
    key: 'google/current-alpha',
    label: 'Current Alpha',
  }),
  createModel({
    key: 'openai/current-beta',
    label: 'Current Beta',
  }),
  createModel({
    isLegacy: true,
    key: 'google/legacy-alpha',
    label: 'Legacy Alpha',
  }),
  createModel({
    isLegacy: true,
    key: 'openai/legacy-beta',
    label: 'Legacy Beta',
  }),
];

beforeEach(() => {
  window.localStorage.clear();
});

function openPicker(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: /select models/i }));
}

describe('ModelSelectorPopover', () => {
  it('uses the elevated overlay surface instead of the canvas card', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    expect(screen.getByTestId('model-selector-popover')).toHaveClass(
      'bg-secondary',
      'shadow-dropdown',
    );
    expect(container.querySelector('.bg-card')).toBeNull();
  });

  it('lists every variant as its own row with no family to open first', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
          createModel({
            key: 'google/nano-banana-pro',
            label: 'Nano Banana Pro',
          }),
        ]}
        values={[]}
        onChange={onChange}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    expect(screen.getByText('Nano Banana')).toBeInTheDocument();
    expect(screen.getByText('Nano Banana Pro')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /collapsed|expanded/ }),
    ).not.toBeInTheDocument();
    // The row carries the model name once — the old family layout printed the
    // variant and then repeated the full label underneath it.
    expect(screen.queryByText('Pro')).not.toBeInTheDocument();

    await user.click(screen.getByText('Nano Banana Pro'));

    expect(onChange).toHaveBeenCalledWith('models', ['google/nano-banana-pro']);
  });

  it('shows a provider mark on every row instead of a provider rail', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({ key: 'google/nano-banana', label: 'Nano Banana' }),
          createModel({ key: 'openai/gpt-image', label: 'GPT Image' }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    expect(screen.getAllByTestId('model-row-provider-icon')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: /all providers/i }),
    ).not.toBeInTheDocument();
  });

  it('renders audio support as an icon, never as a word in the row', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            category: ModelCategory.VIDEO,
            hasSpeech: true,
            key: 'google/veo-3',
            label: 'Veo 3',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    const row = screen.getByText('Veo 3').closest('button');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByRole('img', { name: 'Audio' }),
    ).toBeInTheDocument();
    expect(row?.textContent).not.toContain('Audio');
  });

  it('offers a capability pill only when the catalog can satisfy it', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ModelSelectorPopover
        models={[
          createModel({ key: 'google/nano-banana', label: 'Nano Banana' }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    expect(
      screen.queryByRole('group', { name: 'Filter models' }),
    ).not.toBeInTheDocument();

    rerender(
      <ModelSelectorPopover
        models={[
          createModel({ key: 'google/nano-banana', label: 'Nano Banana' }),
          createModel({
            hasSpeech: true,
            key: 'google/veo-3',
            label: 'Veo 3',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    const filterGroup = screen.getByRole('group', { name: 'Filter models' });
    expect(
      within(filterGroup).getByRole('button', { name: 'Audio' }),
    ).toBeInTheDocument();
    expect(
      within(filterGroup).queryByRole('button', { name: 'Fast' }),
    ).not.toBeInTheDocument();
  });

  it('narrows the list to one capability at a time', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({ key: 'google/nano-banana', label: 'Nano Banana' }),
          createModel({
            hasAudioToggle: true,
            key: 'google/veo-3',
            label: 'Veo 3',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    const filterGroup = screen.getByRole('group', { name: 'Filter models' });
    await user.click(
      within(filterGroup).getByRole('button', { name: 'Audio' }),
    );

    expect(screen.getByText('Veo 3')).toBeInTheDocument();
    expect(screen.queryByText('Nano Banana')).not.toBeInTheDocument();
    expect(
      within(filterGroup).getByRole('button', { name: 'Audio' }),
    ).toHaveAttribute('aria-pressed', 'true');
    // Capability views are catalog subsets — routing is not one of them.
    expect(screen.queryByText('Best Quality')).not.toBeInTheDocument();
  });

  it('filters by source pill and hides auto outside its source groups', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            id: 'model-1',
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
          createModel({
            id: 'training-1',
            key: 'google/nano-banana-pro',
            label: 'Nano Banana Pro',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        prioritize={RouterPriority.BALANCED}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
        sourceGroupResolver={(model) =>
          model.id === 'training-1' ? 'trainings' : 'models'
        }
        sourceGroupLabels={{ models: 'GenFeed', trainings: 'Trainings' }}
        autoSourceGroups={['models']}
      />,
    );

    await openPicker(user);

    const filterGroup = screen.getByRole('group', { name: 'Filter models' });
    expect(screen.getByText('Best Quality')).toBeInTheDocument();

    await user.click(
      within(filterGroup).getByRole('button', { name: 'Trainings' }),
    );

    expect(screen.getByText('Nano Banana Pro')).toBeInTheDocument();
    expect(screen.queryByText('Nano Banana')).not.toBeInTheDocument();
    expect(screen.queryByText('Best Quality')).not.toBeInTheDocument();
  });

  it('keeps auto routing and the manual catalog visible when auto is selected', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
        ]}
        values={['__auto_model__']}
        onChange={vi.fn()}
        prioritize={RouterPriority.QUALITY}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    expect(screen.getByText('Best Quality')).toBeInTheDocument();
    expect(screen.getByText('Nano Banana')).toBeInTheDocument();
  });

  it('does not offer Auto when the allowlisted catalog is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ModelSelectorPopover
        autoLabel="Auto · Lowest Cost"
        models={[]}
        values={['__auto_model__']}
        onChange={onChange}
        onPrioritizeChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /auto|select models/i }),
    );

    expect(screen.queryByText('Lowest Cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Fastest')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('always emits the Auto sentinel when a priority card is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPrioritizeChange = vi.fn();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
        ]}
        values={['__auto_model__']}
        onChange={onChange}
        prioritize={RouterPriority.BALANCED}
        onPrioritizeChange={onPrioritizeChange}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);
    await user.click(screen.getByText('Fastest'));

    expect(onPrioritizeChange).toHaveBeenCalledWith(RouterPriority.SPEED);
    expect(onChange).toHaveBeenCalledWith('models', ['__auto_model__']);
  });

  it('ranks favorites and recents above the rest of the catalog, once each', async () => {
    window.localStorage.setItem(
      'genfeed:model-recent-keys',
      JSON.stringify(['google/model-c']),
    );

    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({ key: 'google/model-a', label: 'Model A' }),
          createModel({ key: 'google/model-b', label: 'Model B' }),
          createModel({ key: 'google/model-c', label: 'Model C' }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={['google/model-b']}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    const popoverText =
      screen.getByTestId('model-selector-popover').textContent ?? '';

    expect(popoverText.indexOf('Favorites')).toBeGreaterThan(-1);
    expect(popoverText.indexOf('Favorites')).toBeLessThan(
      popoverText.indexOf('Recent'),
    );
    expect(popoverText.indexOf('Recent')).toBeLessThan(
      popoverText.indexOf('All models'),
    );
    expect(screen.getAllByText('Model B')).toHaveLength(1);
    expect(screen.getAllByText('Model C')).toHaveLength(1);
  });

  it('records the model it just selected as recent', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[createModel({ key: 'google/model-a', label: 'Model A' })]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);
    await user.click(screen.getByText('Model A'));

    expect(
      JSON.parse(
        window.localStorage.getItem('genfeed:model-recent-keys') ?? '[]',
      ),
    ).toEqual(['google/model-a']);
  });

  it('hides deprecated models until the Legacy pill is chosen', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={catalogFilterFixtures}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    expect(screen.getByText('Current Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Alpha')).not.toBeInTheDocument();

    const filterGroup = screen.getByRole('group', { name: 'Filter models' });
    await user.click(
      within(filterGroup).getByRole('button', { name: 'Legacy' }),
    );

    expect(screen.getByText('Legacy Alpha')).toBeInTheDocument();
    expect(screen.getByText('Legacy Beta')).toBeInTheDocument();
    expect(screen.queryByText('Current Alpha')).not.toBeInTheDocument();
  });

  it('collapses search to one flat list that still reaches legacy models', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={catalogFilterFixtures}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={['google/current-alpha']}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);
    await user.type(screen.getByPlaceholderText('Search models…'), 'alpha');

    expect(screen.getByText('Current Alpha')).toBeInTheDocument();
    expect(screen.getByText('Legacy Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Current Beta')).not.toBeInTheDocument();
    // One result list — no Favorites/Recent/All split while searching.
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
    expect(screen.queryByText('All models')).not.toBeInTheDocument();
  });

  it('reports an empty catalog instead of an empty section heading', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[createModel({ key: 'google/model-a', label: 'Model A' })]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);
    await user.type(screen.getByPlaceholderText('Search models…'), 'zzzz');

    expect(screen.getByText('No models found')).toBeInTheDocument();
    expect(screen.queryByText('All models')).not.toBeInTheDocument();
  });

  it('gives favorite toggles an accessible model-specific label', async () => {
    const user = userEvent.setup();
    const onFavoriteToggle = vi.fn();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={onFavoriteToggle}
      />,
    );

    await openPicker(user);
    await user.click(
      screen.getByRole('button', { name: 'Add Nano Banana to favorites' }),
    );

    expect(onFavoriteToggle).toHaveBeenCalledWith('google/nano-banana');
  });

  it('blocks selecting models that cost more credits than available', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            cost: 50,
            key: 'openai/expensive',
            label: 'Expensive Model',
          }),
        ]}
        values={[]}
        onChange={onChange}
        creditsAvailable={5}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await openPicker(user);

    expect(screen.getByText('Credits')).toBeInTheDocument();

    await user.click(screen.getByText('Expensive Model'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when disabled and stays closed after re-enabling', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: /select models/i });
    await user.click(trigger);
    expect(screen.getByPlaceholderText('Search models…')).toBeInTheDocument();

    rerender(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
        isDisabled
      />,
    );

    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByPlaceholderText('Search models…'),
    ).not.toBeInTheDocument();

    rerender(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    expect(
      screen.queryByPlaceholderText('Search models…'),
    ).not.toBeInTheDocument();
  });
});
