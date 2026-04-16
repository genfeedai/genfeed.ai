import { ModelCategory, ModelProvider, RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/command', async () => {
  const React = await import('react');

  return {
    Command: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
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
      onValueChange,
      placeholder,
      value,
    }: {
      onValueChange?: (value: string) => void;
      placeholder?: string;
      value?: string;
    }) => (
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      />
    ),
    CommandItem: ({
      children,
      onSelect,
      value,
    }: {
      children: React.ReactNode;
      onSelect?: (value: string) => void;
      value?: string;
    }) => (
      <div role="button" tabIndex={0} onClick={() => onSelect?.(value ?? '')}>
        {children}
      </div>
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
      __popoverOpen,
    }: {
      children: React.ReactNode;
      __popoverOpen?: boolean;
    }) => (__popoverOpen ? <div>{children}</div> : null),
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

describe('ModelSelectorPopover', () => {
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
  });

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
    expect(screen.getByText('Optimize for Balanced')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trainings' }));

    expect(screen.getByText('Nano Banana')).toBeInTheDocument();
    expect(screen.queryByText('Optimize for Balanced')).not.toBeInTheDocument();
  });

  it('hides the manual model catalog when auto is selected and exposes a priority selector', async () => {
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

    expect(
      screen.queryByPlaceholderText('Search models...'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Nano Banana')).not.toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /auto routing priority/i }),
    );
    await user.click(screen.getByRole('button', { name: 'Balanced' }));

    expect(onPrioritizeChange).toHaveBeenCalledWith(RouterPriority.BALANCED);
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

  it('shows deprecated models with a legacy badge', async () => {
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
    await user.click(screen.getByRole('button', { name: /nano banana/i }));

    expect(screen.getByText('Nano Banana Pro')).toBeInTheDocument();
    expect(screen.getAllByText('Legacy')).toHaveLength(2);
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
    await user.type(screen.getByPlaceholderText('Search models...'), '3.1');

    expect(screen.getByText('Veo')).toBeInTheDocument();
    expect(screen.getByText('3.1 Fast')).toBeInTheDocument();
  });
});
