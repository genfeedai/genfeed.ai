import {
  ModelCategory,
  ModelProvider,
  RouterPriority,
} from '@genfeedai/contracts';
import type {
  IModel,
  IStudioLook,
  StudioPlaygroundCapabilities,
} from '@genfeedai/contracts/interfaces';
import type { GenerationSetup } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import type { GenerationSetupTypeOption } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupPopover from '@ui/dropdowns/generation-setup/GenerationSetupPopover';
import { describe, expect, it, vi } from 'vitest';

const BANNER_ID = testId('systembanner');
const DANCE_ID = testId('systemdance');

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const harnessMocks = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(undefined),
  reads: vi.fn(),
}));
vi.mock('@hooks/data/generation/use-generation-harness-settings', () => ({
  useGenerationHarnessSettings: () => {
    harnessMocks.reads();
    return {
      settings: {
        organizationEnabled: true,
        brandEnabled: null,
        brandId: 'brand-1',
        isEnabled: true,
        source: 'organization',
      },
      brandId: 'brand-1',
      error: null,
      isLoading: false,
      isSaving: false,
      save: harnessMocks.save,
      refresh: vi.fn(),
    };
  },
}));
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
            ? React.cloneElement(
                child as React.ReactElement<Record<string, unknown>>,
                {
                  __popoverOpen: open,
                  __setPopoverOpen: onOpenChange,
                },
              )
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
        <div className={className} data-testid="generation-setup-popover">
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
        {heading ? (
          <div aria-level={2} role="heading">
            {heading}
          </div>
        ) : null}
        {children}
      </section>
    ),
    CommandInput: ({
      className,
      onValueChange,
      placeholder,
    }: {
      className?: string;
      onValueChange?: (value: string) => void;
      placeholder?: string;
    }) => (
      <input
        className={className}
        onChange={(event) => onValueChange?.(event.target.value)}
        placeholder={placeholder}
      />
    ),
    CommandItem: ({
      children,
      onSelect,
      onPointerDown,
      value,
      ...props
    }: {
      children: React.ReactNode;
      onSelect?: (value: string) => void;
      onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
      value?: string;
      'aria-label'?: string;
      disabled?: boolean;
    }) => (
      <button
        {...props}
        onClick={() => onSelect?.(value ?? '')}
        onPointerDown={onPointerDown}
        type="button"
      >
        {children}
      </button>
    ),
    CommandList: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
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
      'aria-label'?: string;
      disabled?: boolean;
    }) => (
      <div data-value={value}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<Record<string, unknown>>,
                {
                  __onValueChange: onValueChange,
                },
              )
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
            ? React.cloneElement(
                child as React.ReactElement<Record<string, unknown>>,
                {
                  __onValueChange,
                },
              )
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
      <button onClick={() => __onValueChange?.(value)} type="button">
        {children}
      </button>
    ),
    SelectTrigger: ({
      children,
      __onValueChange: _onValueChange,
      ...props
    }: {
      children: React.ReactNode;
      __onValueChange?: (value: string) => void;
    }) => (
      <button aria-expanded={false} role="combobox" type="button" {...props}>
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

  return {
    SimpleTooltip: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
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

function createPreset(
  overrides: Partial<IStudioLook> & Pick<IStudioLook, 'id' | 'label'>,
): IStudioLook {
  return {
    assetType: 'image',
    brandId: 'brand-1',
    camera: 'wide',
    createdAt: '2026-01-01',
    isDeleted: false,
    lens: '35mm',
    lighting: 'soft',
    mood: 'calm',
    organizationId: 'org-1',
    promptTemplate: '',
    scene: 'studio',
    style: 'cinematic',
    updatedAt: '2026-01-01',
    userId: 'user-1',
    ...overrides,
  } as IStudioLook;
}

const capabilities: StudioPlaygroundCapabilities = {
  hasAspectRatio: true,
  hasBrandEnrichment: true,
  hasDuration: false,
  hasIdentity: false,
  hasInstrumentalToggle: false,
  hasLook: true,
  hasLyrics: false,
  hasModelSelection: true,
  hasOutputs: true,
  hasReferences: false,
  hasSpeech: false,
  hasStyle: false,
};

const typeOptions: GenerationSetupTypeOption[] = [
  { label: 'Image', value: 'image' },
];

function createSetup(
  overrides: Partial<GenerationSetup> = {},
): GenerationSetup {
  return {
    sources: {},
    values: {
      aspectRatio: '1:1',
      brandingMode: 'off',
      isPromptEnhanceEnabled: false,
      modelKey: '',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      type: 'image',
    },
    ...overrides,
  };
}

function renderPopover(
  overrides: Partial<React.ComponentProps<typeof GenerationSetupPopover>> = {},
) {
  return render(<GenerationSetupPopover {...popoverProps(overrides)} />);
}

function popoverProps(
  overrides: Partial<React.ComponentProps<typeof GenerationSetupPopover>> = {},
): React.ComponentProps<typeof GenerationSetupPopover> {
  return {
    capabilities,
    favoriteModelKeys: [],
    lookOptions: {},
    models: [createModel({ key: 'google/nano-banana', label: 'Nano Banana' })],
    onApplyPreset: vi.fn(),
    onClearPreset: vi.fn(),
    onFavoriteToggle: vi.fn(),
    onResetAll: vi.fn(),
    onResetField: vi.fn(),
    onSavePreset: vi.fn(),
    onSetField: vi.fn(),
    presets: [],
    reasons: {},
    scopeKey: 'scope-1',
    setup: createSetup(),
    typeOptions,
    ...overrides,
  };
}

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Generation setup' }));
}

describe('GenerationSetupPopover', () => {
  it('uses mutually exclusive Auto and Advanced buttons and keeps presets outside Studio setup', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = renderPopover({
      showPresets: false,
      advancedMode: { isEnabled: false, onChange },
    });
    await openPopover(user);
    const group = within(screen.getByRole('group', { name: 'Advanced' }));
    expect(group.getByRole('button', { name: 'Auto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(group.getByRole('button', { name: 'Advanced' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('switch', { name: 'Advanced' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Configure Presets' }),
    ).toBeNull();
    await user.click(group.getByRole('button', { name: 'Advanced' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    view.rerender(
      <GenerationSetupPopover
        {...popoverProps({
          showPresets: false,
          advancedMode: { isEnabled: true, onChange },
        })}
      />,
    );
    expect(group.getByRole('button', { name: 'Advanced' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(group.getByRole('button', { name: 'Auto' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('offers Edit image as a tile next to Image in both modes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = renderPopover({
      advancedMode: { isEnabled: true, onChange: vi.fn() },
      isIconOnly: true,
      imageEditing: { isEnabled: false, label: 'Edit image', onChange },
    });
    await openPopover(user);
    const types = within(screen.getByRole('group', { name: 'Type' }));
    expect(screen.queryByRole('switch', { name: 'Edit image' })).toBeNull();
    await user.click(types.getByRole('button', { name: 'Edit image' }));
    expect(onChange).toHaveBeenCalledWith(true);
    view.rerender(
      <GenerationSetupPopover
        {...popoverProps({
          advancedMode: { isEnabled: true, onChange: vi.fn() },
          isIconOnly: true,
          imageEditing: { isEnabled: true, label: 'Edit image', onChange },
        })}
      />,
    );
    expect(
      within(screen.getByRole('group', { name: 'Type' })).getByRole('button', {
        name: 'Edit image',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(types.getByRole('button', { name: 'Image' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('opens prompt enhancement inside Brand and preserves organization and brand writes', async () => {
    const user = userEvent.setup();
    harnessMocks.reads.mockClear();
    harnessMocks.save.mockClear();
    renderPopover({ showEnhancementSettings: true });
    await openPopover(user);
    expect(harnessMocks.reads).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Configure Prompt enhancement' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Configure Brand' }));
    expect(screen.getByText('Brand voice')).toBeInTheDocument();
    await user.click(
      screen.getByRole('switch', { name: 'Organization prompt enhancement' }),
    );
    expect(harnessMocks.save).toHaveBeenCalledWith('organization', false);
    await user.click(screen.getByRole('button', { name: 'Off' }));
    expect(harnessMocks.save).toHaveBeenCalledWith('brand', false);
    await user.click(screen.getByRole('button', { name: 'Back to setup' }));
    expect(
      screen.getByRole('button', { name: 'Configure Brand' }),
    ).toBeInTheDocument();
  });

  it('starts with the type tiles and only the rows the toolbar does not show', async () => {
    const user = userEvent.setup();
    renderPopover({
      lookOptions: { style: [{ key: 'cinema', label: 'Cinema' }] },
    });
    await openPopover(user);
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument();
    for (const category of ['Brand', 'Presets']) {
      expect(
        screen.getByRole('button', { name: `Configure ${category}` }),
      ).toBeInTheDocument();
    }
    for (const category of ['Type', 'Model', 'Output', 'Look']) {
      expect(
        screen.queryByRole('button', { name: `Configure ${category}` }),
      ).toBeNull();
    }
    expect(screen.queryByText('Agent pick')).not.toBeInTheDocument();
    expect(screen.queryByText('No saved presets yet.')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Save as preset…'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Search setup fields' }),
    ).not.toBeInTheDocument();
  });

  it('commits generation type from the tiles', async () => {
    const user = userEvent.setup();
    const onTypeChange = vi.fn();
    renderPopover({
      onTypeChange,
      typeOptions: [...typeOptions, { label: 'Video', value: 'video' }],
    });
    await openPopover(user);
    const types = within(screen.getByRole('group', { name: 'Type' }));
    await user.click(types.getByRole('button', { name: 'Image' }));
    expect(onTypeChange).not.toHaveBeenCalled();
    await user.click(types.getByRole('button', { name: 'Video' }));
    expect(onTypeChange).toHaveBeenCalledWith('video');
  });

  it('puts the Auto and Advanced switch below the type tiles', async () => {
    const user = userEvent.setup();
    renderPopover({ advancedMode: { isEnabled: false, onChange: vi.fn() } });
    await openPopover(user);
    const tiles = screen.getByRole('group', { name: 'Type' });
    const mode = screen.getByRole('group', { name: 'Advanced' });
    expect(
      tiles.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows only the output types in Auto', async () => {
    const user = userEvent.setup();
    const onEditChange = vi.fn();
    renderPopover({
      advancedMode: { isEnabled: false, onChange: vi.fn() },
      imageEditing: {
        isEnabled: false,
        label: 'Edit image',
        onChange: onEditChange,
      },
    });
    await openPopover(user);
    const types = within(screen.getByRole('group', { name: 'Type' }));
    expect(types.getByRole('button', { name: 'Image' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const name of ['Brand', 'Presets'])
      expect(
        screen.queryByRole('button', { name: `Configure ${name}` }),
      ).toBeNull();
    await user.click(types.getByRole('button', { name: 'Edit image' }));
    expect(onEditChange).toHaveBeenCalledWith(true);
  });

  it('marks exactly one output type active in Auto', async () => {
    const user = userEvent.setup();
    const onTypeChange = vi.fn();
    renderPopover({
      advancedMode: { isEnabled: false, onChange: vi.fn() },
      imageEditing: {
        isEnabled: false,
        label: 'Edit image',
        onChange: vi.fn(),
      },
      onTypeChange,
      setup: createSetup({
        values: { ...createSetup().values, type: 'video' },
      }),
      typeOptions: [...typeOptions, { label: 'Video', value: 'video' }],
    });
    await openPopover(user);
    const types = within(screen.getByRole('group', { name: 'Type' }));
    const pressed = types
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((button) => button.textContent)).toEqual(['Video']);
    await user.click(types.getByRole('button', { name: 'Image' }));
    expect(onTypeChange).toHaveBeenCalledWith('image');
  });

  it('resets all from the category menu', async () => {
    const user = userEvent.setup();
    const onResetAll = vi.fn();
    renderPopover({ onResetAll });
    await openPopover(user);
    await user.click(
      screen.getByRole('button', { name: 'Reset all fields to agent' }),
    );
    expect(onResetAll).toHaveBeenCalledOnce();
  });

  it('hides the Brand row when neither brand voice nor prompt enhancement applies', async () => {
    const user = userEvent.setup();
    renderPopover({
      capabilities: { ...capabilities, hasBrandEnrichment: false },
    });
    await openPopover(user);
    expect(
      screen.queryByRole('button', { name: 'Configure Brand' }),
    ).not.toBeInTheDocument();
  });

  it('shows a pinned-preset banner and unpins via onClearPreset', async () => {
    const user = userEvent.setup();
    const onClearPreset = vi.fn();
    const preset = createPreset({ id: 'preset-1', label: 'Studio Look' });
    renderPopover({
      onClearPreset,
      presets: [preset],
      setup: createSetup({ presetId: 'preset-1' }),
    });
    await openPopover(user);
    expect(screen.getByText('Pinned: Studio Look')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unpin preset' }));
    expect(onClearPreset).toHaveBeenCalledOnce();
  });

  it('searches, saves, deletes, and applies presets only in Presets', async () => {
    const user = userEvent.setup();
    const onApplyPreset = vi.fn();
    const onDeletePreset = vi.fn();
    const onSavePreset = vi.fn();
    const preset = createPreset({ id: 'preset-1', label: 'Studio Look' });
    renderPopover({
      onApplyPreset,
      onDeletePreset,
      onSavePreset,
      presets: [preset, createPreset({ id: 'preset-2', label: 'Night' })],
    });
    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Configure Presets' }));
    await user.type(screen.getByPlaceholderText('Search presets…'), 'studio');
    expect(screen.queryByText('Night')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete preset Night' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Delete preset Studio Look' }),
    );
    expect(onDeletePreset).toHaveBeenCalledWith('preset-1');
    expect(onApplyPreset).not.toHaveBeenCalled();
    await user.type(screen.getByPlaceholderText('Save as preset…'), 'New look');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSavePreset).toHaveBeenCalledWith('New look');
    await user.click(
      screen.getByRole('button', { name: 'Apply preset Studio Look' }),
    );
    expect(onApplyPreset).toHaveBeenCalledWith(preset);
    expect(
      screen.getByRole('button', { name: 'Configure Presets' }),
    ).toBeInTheDocument();
  });

  it('lists system presets with saved ones, applies them by id, and never offers deleting them', async () => {
    const user = userEvent.setup();
    const onApplySystemPreset = vi.fn();
    const onDeletePreset = vi.fn();
    renderPopover({
      onApplySystemPreset,
      onDeletePreset,
      presets: [createPreset({ id: 'preset-1', label: 'Studio Look' })],
      systemPresets: [
        { id: BANNER_ID, label: 'Banner' },
        { id: DANCE_ID, label: 'Dance' },
      ],
    });
    await openPopover(user);
    expect(
      screen.getByRole('button', { name: 'Configure Presets' }),
    ).toHaveTextContent('3');
    await user.click(screen.getByRole('button', { name: 'Configure Presets' }));
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete preset Banner' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Apply preset Banner' }),
    );
    expect(onApplySystemPreset).toHaveBeenCalledWith(BANNER_ID);
    expect(onDeletePreset).not.toHaveBeenCalled();
  });

  it('offers system presets when the organization has no saved presets', async () => {
    const user = userEvent.setup();
    renderPopover({
      presets: [],
      systemPresets: [{ id: DANCE_ID, label: 'Dance' }],
    });
    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Configure Presets' }));
    expect(
      screen.getByRole('button', { name: 'Apply preset Dance' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
  });

  it('names a pinned system preset in the banner', async () => {
    const user = userEvent.setup();
    renderPopover({
      setup: createSetup({ presetId: DANCE_ID }),
      systemPresets: [{ id: DANCE_ID, label: 'Dance' }],
    });
    await openPopover(user);
    expect(screen.getByText('Pinned: Dance')).toBeInTheDocument();
  });

  it('disables preset deletion while presets are loading and deletes once they load', async () => {
    const user = userEvent.setup();
    const onApplyPreset = vi.fn();
    const onDeletePreset = vi.fn();
    const preset = createPreset({ id: 'preset-1', label: 'Studio Look' });
    const overrides = {
      isPresetsLoading: true,
      onApplyPreset,
      onDeletePreset,
      presets: [preset],
    };
    const view = renderPopover(overrides);
    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Configure Presets' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading presets');
    const deletePreset = screen.getByRole('button', {
      name: 'Delete preset Studio Look',
    });
    expect(deletePreset).toBeDisabled();
    await user.click(deletePreset);
    expect(onDeletePreset).not.toHaveBeenCalled();
    expect(onApplyPreset).not.toHaveBeenCalled();

    view.rerender(
      <GenerationSetupPopover
        {...popoverProps({ ...overrides, isPresetsLoading: false })}
      />,
    );
    const loadedDelete = screen.getByRole('button', {
      name: 'Delete preset Studio Look',
    });
    expect(loadedDelete).toBeEnabled();
    await user.click(loadedDelete);
    expect(onDeletePreset).toHaveBeenCalledOnce();
    expect(onDeletePreset).toHaveBeenCalledWith('preset-1');
    expect(onApplyPreset).not.toHaveBeenCalled();
  });
});
