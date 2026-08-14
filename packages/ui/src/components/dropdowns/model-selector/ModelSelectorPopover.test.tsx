import { ModelCategory, ModelProvider, RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import { describe, expect, it, vi } from 'vitest';

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

function visibleExpandedModelFamilies(): string[] {
  return screen
    .getAllByRole('button', { name: /, .+, expanded$/ })
    .map((button) => button.getAttribute('aria-label') ?? '')
    .toSorted();
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

    await user.click(screen.getByRole('button', { name: /select models/i }));

    expect(screen.getByTestId('model-selector-popover')).toHaveClass(
      'bg-tertiary',
      'shadow-dropdown',
    );
    expect(container.querySelector('.bg-card')).toBeNull();
  });

  it('renders family groups and selects concrete variants', async () => {
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

    await user.click(screen.getByRole('button', { name: /select models/i }));

    expect(screen.getByText('Nano Banana')).toBeInTheDocument();
    expect(screen.queryByText('Base')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /nano banana/i }));

    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();

    await user.click(screen.getByText('Pro'));

    expect(onChange).toHaveBeenCalledWith('models', ['google/nano-banana-pro']);
  }, 15_000);

  it('filters source tabs and hides auto in trainings', async () => {
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
        sourceGroupLabels={{
          models: 'Models',
          trainings: 'Trainings',
        }}
        autoSourceGroups={['models']}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));
    expect(screen.getByText('Balanced')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trainings' }));

    expect(screen.getByText('Nano Banana')).toBeInTheDocument();
    expect(screen.queryByText('Balanced')).not.toBeInTheDocument();
  });

  it('keeps auto routing and the manual catalog visible when auto is selected', async () => {
    const user = userEvent.setup();
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
        onChange={vi.fn()}
        prioritize={RouterPriority.QUALITY}
        onPrioritizeChange={onPrioritizeChange}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /auto/i }));

    expect(screen.getByPlaceholderText('Search models…')).toBeInTheDocument();
    expect(screen.getByText('Nano Banana')).toBeInTheDocument();
    expect(screen.getByText('Best Quality')).toBeInTheDocument();
    expect(screen.getByText('Lowest Cost')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Balanced' }));

    expect(onPrioritizeChange).toHaveBeenCalledWith(RouterPriority.BALANCED);
  });

  it('selects auto mode when a routing option is chosen from the flat list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ModelSelectorPopover
        models={[]}
        values={[]}
        onChange={onChange}
        onPrioritizeChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));
    await user.click(screen.getByRole('button', { name: 'Fastest' }));

    expect(onChange).toHaveBeenCalledWith('models', ['__auto_model__']);
  });

  it('shows only favorite families in favorites mode', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana',
            label: 'Nano Banana',
          }),
          createModel({
            category: ModelCategory.VIDEO,
            key: 'google/veo-3.1',
            label: 'Veo 3.1',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={['google/veo-3.1']}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));
    await user.click(screen.getByRole('button', { name: 'Favorites' }));

    expect(screen.getByText('Veo')).toBeInTheDocument();
    expect(screen.queryByText('Nano Banana')).not.toBeInTheDocument();
  });

  it('shows deprecated models with a legacy badge under the Legacy rail', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            isDeprecated: true,
            key: 'google/nano-banana-pro',
            label: 'Nano Banana Pro',
          } as IModel),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));
    await user.click(screen.getByRole('button', { name: 'Legacy models' }));
    await user.click(screen.getByRole('button', { name: /nano banana/i }));

    expect(screen.getByText('Nano Banana Pro')).toBeInTheDocument();
    // Family heading "Legacy" section + row badge.
    expect(screen.getAllByText('Legacy').length).toBeGreaterThanOrEqual(1);
  });

  it('auto-expands matching families when searching', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            category: ModelCategory.VIDEO,
            key: 'google/veo-3',
            label: 'Veo 3',
          }),
          createModel({
            category: ModelCategory.VIDEO,
            key: 'google/veo-3.1-fast',
            label: 'Veo 3.1 (Fast)',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));
    await user.type(screen.getByPlaceholderText('Search models…'), '3.1');

    expect(screen.getByText('Veo')).toBeInTheDocument();
    expect(screen.getByText('3.1 Fast')).toBeInTheDocument();
  });

  it('gives favorite toggles an accessible model-specific label', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/nano-banana-pro',
            label: 'Nano Banana Pro',
          }),
        ]}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));
    await user.click(screen.getByRole('button', { name: /nano banana/i }));

    expect(
      screen.getByRole('button', {
        name: 'Add Nano Banana Pro to favorites',
      }),
    ).toBeInTheDocument();
  });

  it('always emits the Auto sentinel when a priority card is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPrioritizeChange = vi.fn();

    render(
      <ModelSelectorPopover
        models={[
          createModel({
            key: 'google/gemini-flash',
            label: 'Gemini Flash',
          }),
        ]}
        values={['google/gemini-flash']}
        onChange={onChange}
        onPrioritizeChange={onPrioritizeChange}
        autoLabel="Auto · Balanced"
        prioritize={RouterPriority.BALANCED}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
        selectionMode="single"
      />,
    );

    // Trigger currently shows the concrete model.
    expect(screen.getByText('Gemini Flash')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /gemini flash/i }));
    // Brand rail is always available for filtering.
    expect(
      screen.getByRole('button', { name: 'All providers' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Best Quality' }));

    expect(onPrioritizeChange).toHaveBeenCalledWith(RouterPriority.QUALITY);
    expect(onChange).toHaveBeenCalledWith('models', ['__auto_model__']);
  });

  it('shows the exact current and legacy catalog fixture memberships', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelectorPopover
        models={catalogFilterFixtures}
        values={[]}
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
        selectionMode="single"
        autoLabel="Auto"
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));
    expect(visibleExpandedModelFamilies()).toEqual([
      'Current Alpha, Google, expanded',
      'Current Beta, OpenAI, expanded',
    ]);

    await user.click(screen.getByRole('button', { name: 'Legacy models' }));
    expect(visibleExpandedModelFamilies()).toEqual([
      'Legacy Alpha, Google, expanded',
      'Legacy Beta, OpenAI, expanded',
    ]);
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

    await user.click(screen.getByRole('button', { name: /select models/i }));
    // "Expensive Model" is a single-variant family — the credit-lock badge
    // and the selectable row live inside the collapsed family item, so it
    // must be expanded first (same two-step flow as the multi-variant case).
    await user.click(screen.getByRole('button', { name: /expensive model/i }));
    expect(screen.getByText('Credits')).toBeInTheDocument();
    await user.click(screen.getByText('Base'));

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

  it('keeps single-select family toggles keyboard-reachable', async () => {
    const user = userEvent.setup();

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
        onChange={vi.fn()}
        favoriteModelKeys={[]}
        onFavoriteToggle={vi.fn()}
        selectionMode="single"
      />,
    );

    await user.click(screen.getByRole('button', { name: /select models/i }));

    const family = screen.getByRole('button', {
      name: 'Nano Banana, Google, expanded',
    });
    expect(screen.getByText('Pro')).toBeInTheDocument();

    family.focus();
    await user.keyboard('{Enter}');

    expect(family).toHaveAccessibleName('Nano Banana, Google, collapsed');
    expect(screen.queryByText('Pro')).not.toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(family).toHaveAccessibleName('Nano Banana, Google, expanded');
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });
});
