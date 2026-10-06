import {
  ModelCategory,
  ModelProvider,
  RouterPriority,
} from '@genfeedai/contracts';
import type {
  IModel,
  IStudioLook,
  StudioGenerateCapabilities,
} from '@genfeedai/contracts/interfaces';
import type { GenerationSetup } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { GenerationSetupTypeOption } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupPopover from '@ui/dropdowns/generation-setup/GenerationSetupPopover';
import { describe, expect, it, vi } from 'vitest';

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

const capabilities: StudioGenerateCapabilities = {
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
  it('opens enhancement preferences inside the same picker and preserves organization and brand writes', async () => {
    const user = userEvent.setup();
    harnessMocks.reads.mockClear();
    harnessMocks.save.mockClear();
    renderPopover({ showEnhancementSettings: true });
    await openPopover(user);
    expect(harnessMocks.reads).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Configure Prompt enhancement' }),
    );
    await user.click(
      screen.getByRole('switch', { name: 'Organization prompt enhancement' }),
    );
    expect(harnessMocks.save).toHaveBeenCalledWith('organization', false);
    await user.click(screen.getByRole('button', { name: 'Off' }));
    expect(harnessMocks.save).toHaveBeenCalledWith('brand', false);
    await user.click(screen.getByRole('button', { name: 'Back to setup' }));
    expect(
      screen.getByRole('button', { name: 'Configure Model' }),
    ).toBeInTheDocument();
  });

  it('starts with the type and sibling config categories without help or global search', async () => {
    const user = userEvent.setup();
    renderPopover({
      lookOptions: { style: [{ key: 'cinema', label: 'Cinema' }] },
    });
    await openPopover(user);
    expect(
      screen.getByRole('button', { name: 'Configure Type' }),
    ).toBeInTheDocument();
    for (const category of ['Model', 'Output', 'Look', 'Brand', 'Presets']) {
      expect(
        screen.getByRole('button', { name: `Configure ${category}` }),
      ).toBeInTheDocument();
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

  it('commits generation type before entering a config list', async () => {
    const user = userEvent.setup();
    const onSetField = vi.fn();
    const onTypeChange = vi.fn();
    renderPopover({
      onSetField,
      onTypeChange,
      typeOptions: [...typeOptions, { label: 'Video', value: 'video' }],
    });
    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Configure Type' }));
    await user.click(screen.getByRole('button', { name: 'Video' }));
    expect(onSetField).toHaveBeenCalledWith('type', 'video');
    expect(onTypeChange).toHaveBeenCalledWith('video');
    expect(
      screen.queryByPlaceholderText('Search models…'),
    ).not.toBeInTheDocument();
  });

  it('returns to setup without changing the active type or clearing its preset', async () => {
    const user = userEvent.setup();
    const onSetField = vi.fn();
    const onTypeChange = vi.fn();
    renderPopover({
      onSetField,
      onTypeChange,
      setup: createSetup({ presetId: 'preset-1' }),
      typeOptions: [...typeOptions, { label: 'Video', value: 'video' }],
    });
    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Configure Type' }));
    await user.click(screen.getByRole('button', { name: 'Image' }));
    expect(onSetField).not.toHaveBeenCalled();
    expect(onTypeChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Configure Type' }),
    ).toBeInTheDocument();
  });

  it('keeps model search and Auto priorities isolated from output, brand, and presets', async () => {
    const user = userEvent.setup();
    const onSetField = vi.fn();
    renderPopover({ onSetField });
    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Configure Model' }));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Aspect ratio' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Brand voice')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Save as preset…'),
    ).not.toBeInTheDocument();
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Best Quality' }),
      { button: 0 },
    );
    expect(onSetField).toHaveBeenNthCalledWith(1, 'modelKey', '');
    expect(onSetField).toHaveBeenNthCalledWith(
      2,
      'prioritize',
      RouterPriority.QUALITY,
    );
    await user.type(screen.getByPlaceholderText('Search models…'), 'banana');
    expect(screen.getByText('Nano Banana')).toBeInTheDocument();
    expect(screen.queryByText('Best Quality')).not.toBeInTheDocument();
    expect(screen.getByTestId('generation-setup-popover')).toBeVisible();
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

  it('hides unsupported config categories', async () => {
    const user = userEvent.setup();
    renderPopover({
      capabilities: { ...capabilities, hasBrandEnrichment: false },
    });
    await openPopover(user);
    expect(
      screen.queryByRole('button', { name: 'Configure Brand' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Configure Look' }),
    ).not.toBeInTheDocument();
  });

  it('opens Output independently and returns to the category menu', async () => {
    const user = userEvent.setup();
    renderPopover();
    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Configure Output' }));
    expect(
      screen.getByRole('combobox', { name: 'Aspect ratio' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Outputs' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Search models…'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to setup' }));
    expect(
      screen.getByRole('button', { name: 'Configure Model' }),
    ).toBeInTheDocument();
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
