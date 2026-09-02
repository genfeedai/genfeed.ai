import { ModelCategory, ModelProvider, SpeedTier } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelSelectorModelItem from '@ui/dropdowns/model-selector/ModelSelectorModelItem';
import { transformModelsToOptions } from '@ui/dropdowns/model-selector/model-selector.utils';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/command', async () => {
  const React = await import('react');

  return {
    // `asChild` on the tooltip trigger hands the row its ref, so the stub has
    // to accept one the way the real cmdk item does.
    CommandItem: ({
      children,
      onSelect,
      value,
      disabled,
      ref,
      ...props
    }: {
      children: React.ReactNode;
      onSelect?: (value: string) => void;
      value?: string;
      disabled?: boolean;
      ref?: React.Ref<HTMLDivElement>;
    }) => (
      // cmdk renders items as divs, so the favorite Button inside stays a
      // legal child and click bubbling matches production.
      <div
        role="option"
        aria-selected={false}
        tabIndex={-1}
        ref={ref}
        data-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) {
            onSelect?.(value ?? '');
          }
        }}
        {...props}
      >
        {children}
      </div>
    ),
  };
});

function createOption(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
  favoriteModelKeys: string[] = [],
) {
  const model = {
    category: ModelCategory.VIDEO,
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

  return transformModelsToOptions([model], favoriteModelKeys)[0];
}

function renderRow(
  option: ReturnType<typeof createOption>,
  props: Partial<{
    isSelected: boolean;
    isLocked: boolean;
    lockReason: string;
    onToggle: (modelKey: string) => void;
    onFavoriteToggle: (modelKey: string) => void;
  }> = {},
) {
  return render(
    <TooltipProvider delayDuration={0}>
      <ModelSelectorModelItem
        option={option}
        isSelected={props.isSelected ?? false}
        onToggle={props.onToggle ?? vi.fn()}
        onFavoriteToggle={props.onFavoriteToggle ?? vi.fn()}
        selectionMode="single"
        isLocked={props.isLocked}
        lockReason={props.lockReason}
      />
    </TooltipProvider>,
  );
}

describe('ModelSelectorModelItem', () => {
  it('states each capability as an icon with an accessible name, not a word', () => {
    renderRow(
      createOption({
        hasSpeech: true,
        key: 'google/veo-3',
        label: 'Veo 3',
        speedTier: SpeedTier.FAST,
      }),
    );

    const row = screen.getByRole('option');

    expect(within(row).getByRole('img', { name: 'Audio' })).toBeInTheDocument();
    expect(within(row).getByRole('img', { name: 'Fast' })).toBeInTheDocument();
    expect(row.textContent).not.toContain('Audio');
    expect(row.textContent).not.toContain('Fast');
  });

  it('reveals the full model spec on hover', async () => {
    const user = userEvent.setup();

    renderRow(
      createOption({
        description: 'Cinematic shots with native dialogue.',
        durations: [4, 8],
        key: 'google/veo-3',
        label: 'Veo 3',
      }),
    );

    expect(
      screen.queryByText('Cinematic shots with native dialogue.'),
    ).not.toBeInTheDocument();

    await user.hover(screen.getByRole('option'));

    expect(
      await screen.findByText('Cinematic shots with native dialogue.'),
    ).toBeInTheDocument();
    expect(screen.getByText('4s, 8s')).toBeInTheDocument();
  });

  it('explains a credit lock on hover instead of failing silently', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    renderRow(createOption({ cost: 50, key: 'google/veo-3', label: 'Veo 3' }), {
      isLocked: true,
      lockReason: 'Needs 50 credits — 5 available',
      onToggle,
    });

    const row = screen.getByRole('option');
    await user.hover(row);

    expect(
      await screen.findByText('Needs 50 credits — 5 available'),
    ).toBeInTheDocument();

    await user.click(row);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps favoriting separate from selecting', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onFavoriteToggle = vi.fn();

    renderRow(createOption({ key: 'google/veo-3', label: 'Veo 3' }), {
      onFavoriteToggle,
      onToggle,
    });

    await user.click(
      screen.getByRole('button', { name: 'Add Veo 3 to favorites' }),
    );

    expect(onFavoriteToggle).toHaveBeenCalledWith('google/veo-3');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('selects a named model on primary pointer down', () => {
    const onToggle = vi.fn();

    renderRow(createOption({ key: 'google/veo-3', label: 'Veo 3' }), {
      onToggle,
    });

    fireEvent.pointerDown(screen.getByRole('option'), { button: 0 });

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith('google/veo-3');
  });

  it('does not select the model when pointer down starts on favorite', () => {
    const onToggle = vi.fn();
    const onFavoriteToggle = vi.fn();

    renderRow(createOption({ key: 'google/veo-3', label: 'Veo 3' }), {
      onFavoriteToggle,
      onToggle,
    });

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Add Veo 3 to favorites' }),
      { button: 0 },
    );

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('labels the favorite control by what the click will do', () => {
    renderRow(
      createOption({ key: 'google/veo-3', label: 'Veo 3' }, ['google/veo-3']),
    );

    expect(
      screen.getByRole('button', { name: 'Remove Veo 3 from favorites' }),
    ).toBeInTheDocument();
  });
});
