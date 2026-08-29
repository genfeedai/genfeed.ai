import { ModelCategory, ModelProvider, RouterPriority } from '@genfeedai/enums';
import type {
  IModel,
  IStudioLook,
  StudioGenerateCapabilities,
} from '@genfeedai/interfaces';
import type { GenerationSetup } from '@genfeedai/interfaces/studio/generation-setup.interface';
import type { GenerationSetupTypeOption } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupPopover from '@ui/dropdowns/generation-setup/GenerationSetupPopover';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
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
      value,
    }: {
      children: React.ReactNode;
      onSelect?: (value: string) => void;
      value?: string;
    }) => (
      <button onClick={() => onSelect?.(value ?? '')} type="button">
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
    }) => (
      <div data-value={value}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, {
                __onValueChange: onValueChange,
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
      <button onClick={() => __onValueChange?.(value)} type="button">
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
  hasLook: true,
  hasModelSelection: true,
  hasOutputs: true,
  hasReferences: false,
  hasSpeech: false,
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
  return render(
    <GenerationSetupPopover
      capabilities={capabilities}
      favoriteModelKeys={[]}
      lookOptions={{}}
      models={[
        createModel({ key: 'google/nano-banana', label: 'Nano Banana' }),
      ]}
      onApplyPreset={vi.fn()}
      onClearPreset={vi.fn()}
      onFavoriteToggle={vi.fn()}
      onResetAll={vi.fn()}
      onResetField={vi.fn()}
      onSavePreset={vi.fn()}
      onSetField={vi.fn()}
      presets={[]}
      reasons={{}}
      scopeKey="scope-1"
      setup={createSetup()}
      typeOptions={typeOptions}
      {...overrides}
    />,
  );
}

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Generation setup' }));
}

describe('GenerationSetupPopover', () => {
  it('opens on the front door with the agent-pick summary and a search entry', async () => {
    const user = userEvent.setup();
    renderPopover();

    await openPopover(user);

    expect(screen.getByTestId('generation-setup-popover')).toBeVisible();
    expect(screen.getByText('Agent pick')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search setup fields' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No saved presets yet.')).toBeInTheDocument();
  });

  it('switches to the customize panel and resets every field on Reset all', async () => {
    const user = userEvent.setup();
    const onResetAll = vi.fn();
    renderPopover({ onResetAll });

    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Customize setup' }));

    expect(
      screen.getByRole('button', { name: 'Model tab' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Brand tab' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Reset all fields to agent' }),
    );

    expect(onResetAll).toHaveBeenCalledOnce();
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

  it('applies a preset from the front door and returns to the front door', async () => {
    const user = userEvent.setup();
    const onApplyPreset = vi.fn();
    const preset = createPreset({ id: 'preset-1', label: 'Studio Look' });
    renderPopover({ onApplyPreset, presets: [preset] });

    await openPopover(user);
    await user.click(
      screen.getByRole('button', { name: 'Apply preset Studio Look' }),
    );

    expect(onApplyPreset).toHaveBeenCalledWith(preset);
    expect(screen.getByText('Agent pick')).toBeInTheDocument();
  });
});
