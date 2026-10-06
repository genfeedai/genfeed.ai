import {
  CostTier,
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
  QualityTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { getModelCategoryLabel } from '@genfeedai/helpers/ui/icons/model-category-icon';
import { getModelProviderLabel } from '@genfeedai/helpers/ui/model-badge.helper';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { buildModelsTableColumns } from './ModelsTableColumns';

const TABLE_COPY: Record<string, string> = {
  'table.approvedStatus': 'Approved',
  'table.categoryHeader': 'Category',
  'table.chooseSuccessor': 'Choose successor',
  'table.costBasisPerMegapixel': 'Basis: {units} megapixel',
  'table.costBasisPerSecond': 'Basis: {duration} {unit}',
  'table.costBreakdown':
    'Provider {base} + Margin {margin} = Total {total} ({credits} credits)',
  'table.costFree': 'Free',
  'table.costHeader': 'Cost',
  'table.defaultHeader': 'Default',
  'table.keyHeader': 'Key',
  'table.labelHeader': 'Label',
  'table.legacyStatus': 'Legacy',
  'table.lifecycleHeader': 'Lifecycle',
  'table.pendingStatus': 'Pending',
  'table.pricingLockedReason':
    'This paid model has no usable price, so it cannot be marked Available or Recommended.',
  'table.pricingUnavailable': 'Pricing unavailable',
  'table.providerBreakdownUnavailable':
    'Provider breakdown unavailable. Final price: {credits} credits.',
  'table.providerHeader': 'Provider',
  'table.qualityHeader': 'Quality',
  'table.registryHeader': 'Registry',
  'table.rejectedStatus': 'Rejected',
  'table.secondUnit': 'second',
  'table.secondsUnit': 'seconds',
  'table.seededStatus': 'Seeded',
  'table.successorWithLabel': 'Successor: {label}',
};

function translate(
  key: string,
  values?: Record<string, string | number>,
): string {
  const template = TABLE_COPY[key] ?? key;

  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) =>
    String(values[token] ?? ''),
  );
}

function buildModel(overrides: Partial<IModel> = {}): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    costTier: CostTier.LOW,
    id: 'model-1',
    isActive: true,
    isDefault: false,
    lifecycle: ModelLifecycle.AVAILABLE,
    isDeleted: false,
    key: 'flux-dev',
    label: 'Flux Dev',
    qualityTier: QualityTier.STANDARD,
    ...overrides,
  } as IModel;
}

function renderColumn(
  header: string,
  model: IModel,
  isAdminScope = false,
  onOpenDetails: (model: IModel) => void = vi.fn(),
  options: {
    handleLifecycleChange?: (
      model: IModel,
      lifecycle: ModelLifecycle,
      succeededBy?: string,
    ) => void;
    isModelEnabled?: (modelId: string) => boolean;
    models?: IModel[];
  } = {},
): void {
  const columns = buildModelsTableColumns({
    handleAdminToggle: vi.fn(),
    handleLifecycleChange: options.handleLifecycleChange ?? vi.fn(),
    handleToggleModel: vi.fn(),
    isAdminScope,
    isModelEnabled: options.isModelEnabled ?? (() => true),
    isOnlyDefaultInCategory: () => false,
    onOpenDetails,
    togglingModelId: null,
    models: options.models ?? [model],
    translate,
  });
  const column = columns.find((entry) => entry.header === header);
  if (!column?.render) {
    throw new Error(`Missing ${header} column`);
  }
  render(column.render(model));
}

describe('buildModelsTableColumns', () => {
  it('shows a quality bar and pricing symbol instead of a Value label', () => {
    const columns = buildModelsTableColumns({
      handleAdminToggle: vi.fn(),
      handleLifecycleChange: vi.fn(),
      handleToggleModel: vi.fn(),
      isAdminScope: false,
      isModelEnabled: () => true,
      isOnlyDefaultInCategory: () => false,
      onOpenDetails: vi.fn(),
      togglingModelId: null,
      models: [],
      translate,
    });

    expect(columns.map((column) => column.header)).toContain('Quality');
    expect(columns.map((column) => column.header)).toContain('Cost');
    expect(columns.map((column) => column.header)).not.toContain('Description');
    expect(columns.map((column) => column.header)).not.toContain('Value');
    expect(columns.map((column) => column.header)).not.toContain('Provider');
    expect(columns.map((column) => column.header)).not.toContain('Category');
    expect(
      columns
        .filter((column) => column.header)
        .every((column) => column.sortable),
    ).toBe(true);
  });

  it('renders lifecycle and requires a successor for a terminal transition', () => {
    const model = buildModel({ lifecycle: ModelLifecycle.AVAILABLE });
    renderColumn('Lifecycle', model, true);

    expect(
      screen.getByRole('combobox', { name: 'Lifecycle for Flux Dev' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Successor for Flux Dev' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a retired row to a single lifecycle control', () => {
    const successor = buildModel({
      id: 'model-2',
      key: 'flux-pro',
      label: 'Flux Pro',
    });
    const model = buildModel({
      lifecycle: ModelLifecycle.RETIRED,
      succeededBy: 'flux-pro',
    });
    const columns = buildModelsTableColumns({
      handleAdminToggle: vi.fn(),
      handleLifecycleChange: vi.fn(),
      handleToggleModel: vi.fn(),
      isAdminScope: true,
      isModelEnabled: () => true,
      isOnlyDefaultInCategory: () => false,
      onOpenDetails: vi.fn(),
      togglingModelId: null,
      models: [model, successor],
      translate,
    });
    const column = columns.find((entry) => entry.header === 'Lifecycle');
    if (!column?.render) {
      throw new Error('Missing Lifecycle column');
    }
    render(column.render(model));

    expect(
      screen.getByRole('combobox', { name: 'Lifecycle for Flux Dev' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Successor for Flux Dev' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Successor: Flux Pro')).toBeInTheDocument();
  });

  it('renders the model key on one compact line', () => {
    renderColumn('Key', buildModel({ key: 'openrouter/auto-beta' }), true);

    const key = screen.getByText('openrouter/auto-beta');
    expect(key).toHaveClass('truncate', 'whitespace-nowrap', 'text-2xs');
    expect(key).toHaveAttribute('title', 'openrouter/auto-beta');
  });

  it.each(Object.values(ModelProvider))(
    'renders a named provider logo for %s',
    (provider) => {
      renderColumn('Label', buildModel({ provider }), true);

      const logo = screen.getByRole('img', {
        name: getModelProviderLabel(provider),
      });
      expect(logo).toHaveAccessibleName();
      expect(
        screen.getByTitle(`${getModelProviderLabel(provider)} · Image`),
      ).toBeInTheDocument();
      expect(logo.querySelector('svg')).toHaveClass('size-4');
      expect(logo).not.toHaveClass('uppercase');
    },
  );

  it('keeps an unknown provider readable without inventing a logo', () => {
    renderColumn(
      'Label',
      buildModel({ provider: 'future-provider' as ModelProvider }),
      true,
    );

    const provider = screen.getByRole('img', { name: 'Future-provider' });
    expect(provider).toHaveTextContent('F');
    expect(provider.querySelector('svg')).toBeNull();
  });

  it.each(Object.values(ModelCategory))(
    'shows the %s category on the model avatar',
    (category) => {
      renderColumn('Label', buildModel({ category }), true);
      expect(
        screen
          .getByRole('img', { name: getModelCategoryLabel(category) })
          .querySelector('svg'),
      ).toHaveClass('size-3.5');
    },
  );

  it('keeps discovery confidence beside the model identity', () => {
    renderColumn('Label', buildModel({ categoryConfidence: 0.65 }), true);
    expect(screen.getByText('65% confidence')).toBeInTheDocument();
  });

  it('renders the picker quality meter and dollar cost mark', () => {
    renderColumn('Quality', buildModel({ qualityTier: QualityTier.ULTRA }));
    renderColumn('Cost', buildModel({ costTier: CostTier.HIGH }));

    expect(screen.getByRole('meter', { name: 'Quality' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    expect(screen.getByText('$$$')).toBeInTheDocument();
  });

  it('labels an explicitly basic model without promoting it to premium', () => {
    renderColumn('Quality', buildModel({ qualityTier: QualityTier.BASIC }));

    expect(screen.getByText('Basic')).toBeInTheDocument();
  });

  it('renders canonical quality and the exact numeric cost when tiers are missing', () => {
    renderColumn('Quality', buildModel({ qualityTier: undefined }));
    renderColumn('Cost', buildModel({ costTier: undefined }));

    expect(screen.getByRole('meter', { name: 'Quality' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('distinguishes a zero credit price from an explicitly free model', () => {
    renderColumn('Cost', buildModel({ cost: 0, costTier: undefined }));
    renderColumn(
      'Cost',
      buildModel({ cost: 0, costTier: undefined, isFree: true }),
    );

    expect(screen.getByText('Unresolved')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('opens model details from the label', () => {
    const onOpenDetails = vi.fn();
    renderColumn(
      'Label',
      buildModel({ label: 'Flux Dev' }),
      false,
      onOpenDetails,
    );

    screen.getByRole('button', { name: 'View details for Flux Dev' }).click();
    expect(onOpenDetails).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Flux Dev' }),
    );
  });

  it('places the model description under its label', () => {
    const model = buildModel({ description: 'Detailed model description' });
    const columns = buildModelsTableColumns({
      handleAdminToggle: vi.fn(),
      handleLifecycleChange: vi.fn(),
      handleToggleModel: vi.fn(),
      isAdminScope: true,
      isModelEnabled: () => true,
      isOnlyDefaultInCategory: () => false,
      onOpenDetails: vi.fn(),
      togglingModelId: null,
      models: [model],
      translate,
    });

    expect(columns.map((column) => column.header)).not.toContain('Provider');
    expect(columns.map((column) => column.header)).not.toContain('Category');
    const labelColumn = columns.find((column) => column.header === 'Label');

    expect(labelColumn?.subtext?.(model)).toBe('Detailed model description');
  });
});

describe('admin numeric costs', () => {
  it('shows the numeric cost without the model-picker dollar tier', () => {
    renderColumn(
      'Cost',
      buildModel({ cost: 17, costTier: CostTier.HIGH }),
      true,
    );
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.queryByText('$$$')).not.toBeInTheDocument();
  });
  it('does not label an unpriced paid model as zero credits', () => {
    renderColumn('Cost', buildModel({ cost: 0, isFree: false }), true);
    expect(screen.getByText('Unresolved')).toBeInTheDocument();
  });
});

const LOCKED_REASON = TABLE_COPY['table.pricingLockedReason'] ?? '';

function openLifecycle(label: string) {
  fireEvent.keyDown(
    screen.getByRole('combobox', { name: `Lifecycle for ${label}` }),
    { key: 'ArrowDown' },
  );
}

function expectPromotionLocked(name: string, isLocked: boolean) {
  const option = screen.getByRole('option', { name });
  if (isLocked) {
    expect(option).toHaveAttribute('aria-disabled', 'true');
    return;
  }
  expect(option.getAttribute('aria-disabled')).not.toBe('true');
}

describe('paid model pricing lock', () => {
  const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  );

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined,
      writable: true,
    });
  });

  afterAll(() => {
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        scrollIntoViewDescriptor,
      );
      return;
    }
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { cost: 0, label: 'zero' },
    { cost: Number.NaN, label: 'unresolved' },
  ])(
    'locks Available and Recommended for a paid model with a $label price',
    ({ cost }) => {
      const handleLifecycleChange = vi.fn();
      const model = buildModel({
        cost,
        isFree: false,
        succeededBy: 'flux-pro',
      });
      const successor = buildModel({
        cost: 2,
        id: 'model-2',
        key: 'flux-pro',
        label: 'Flux Pro',
      });
      renderColumn('Lifecycle', model, true, vi.fn(), {
        handleLifecycleChange,
        models: [model, successor],
      });

      const lifecycle = screen.getByRole('combobox', {
        name: 'Lifecycle for Flux Dev',
      });
      expect(lifecycle).toBeEnabled();
      expect(lifecycle).toHaveAttribute('title', LOCKED_REASON);
      expect(lifecycle).toHaveAttribute('aria-description', LOCKED_REASON);
      openLifecycle('Flux Dev');
      expectPromotionLocked('Available', true);
      expectPromotionLocked('Recommended', true);
      expectPromotionLocked('Legacy', false);
      expectPromotionLocked('Retired', false);

      fireEvent.keyDown(screen.getByRole('option', { name: 'Available' }), {
        key: 'Enter',
      });
      fireEvent.keyDown(screen.getByRole('option', { name: 'Recommended' }), {
        key: 'Enter',
      });
      expect(handleLifecycleChange).not.toHaveBeenCalled();

      fireEvent.keyDown(screen.getByRole('option', { name: 'Legacy' }), {
        key: 'Enter',
      });
      expect(handleLifecycleChange).toHaveBeenCalledWith(
        model,
        ModelLifecycle.LEGACY,
        'flux-pro',
      );
    },
  );

  it.each([
    ['priced', buildModel({ cost: 4, isFree: false })],
    ['explicitly free', buildModel({ cost: 0, isFree: true })],
  ] as const)('keeps promotion available for a %s model', (_name, model) => {
    renderColumn('Lifecycle', model, true);
    const lifecycle = screen.getByRole('combobox', {
      name: 'Lifecycle for Flux Dev',
    });
    expect(lifecycle).toBeEnabled();
    expect(lifecycle).not.toHaveAttribute('title');
    openLifecycle('Flux Dev');
    expectPromotionLocked('Available', false);
    expectPromotionLocked('Recommended', false);
  });

  it('gates Default for an unpriced paid model and leaves priced and free models switchable', () => {
    renderColumn(
      'Default',
      buildModel({
        cost: 0,
        isFree: false,
        lifecycle: ModelLifecycle.RECOMMENDED,
      }),
      true,
    );
    renderColumn(
      'Default',
      buildModel({ cost: 8, lifecycle: ModelLifecycle.RECOMMENDED }),
      true,
    );
    renderColumn(
      'Default',
      buildModel({
        cost: 0,
        isFree: true,
        lifecycle: ModelLifecycle.RECOMMENDED,
      }),
      true,
    );

    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toBeDisabled();
    expect(switches[1]).toBeEnabled();
    expect(switches[2]).toBeEnabled();
  });

  it('gates the catalog switch for an unpriced paid model', () => {
    renderColumn('', buildModel({ cost: 0, isFree: false }), false, vi.fn(), {
      isModelEnabled: () => false,
    });
    renderColumn('', buildModel({ cost: 0, isFree: false }), false, vi.fn(), {
      isModelEnabled: () => true,
    });
    renderColumn('', buildModel({ cost: 3 }), false);
    renderColumn('', buildModel({ cost: 0, isFree: true }), false);

    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toBeDisabled();
    expect(switches[1]).toBeEnabled();
    expect(switches[2]).toBeEnabled();
    expect(switches[3]).toBeEnabled();
  });
});

describe('admin cost breakdown', () => {
  function focusCost(text: string) {
    const cost = screen.getByText(text);
    fireEvent.focus(cost);
    return { cost, tooltip: screen.getByRole('tooltip') };
  }

  it('shows provider base, uplift margin, and customer total for a flat price', () => {
    renderColumn(
      'Cost',
      buildModel({
        cost: 10,
        costTier: undefined,
        isFree: false,
        pricingType: PricingType.FLAT,
        providerCostUsd: 0.03,
      }),
      true,
    );

    const { cost, tooltip } = focusCost('10');
    expect(cost).toHaveAttribute('tabindex', '0');
    expect(tooltip).toHaveTextContent(
      'Provider $0.03 + Margin $0.07 = Total $0.10 (10 credits)',
    );
    expect(cost.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(screen.getByText('10')).toHaveTextContent('10');
  });

  it('prices a per-second model from the provider unit and default duration', () => {
    renderColumn(
      'Cost',
      buildModel({
        cost: 10,
        costTier: undefined,
        defaultDuration: 5,
        isFree: false,
        pricingType: PricingType.PER_SECOND,
        providerCostUsd: 0.01,
      }),
      true,
    );

    const { tooltip } = focusCost('10');
    expect(tooltip).toHaveTextContent(
      'Provider $0.05 + Margin $0.05 = Total $0.10 (10 credits)',
    );
    expect(tooltip).toHaveTextContent('Basis: 5 seconds');
  });

  it('prices one megapixel when dimensions are unknown', () => {
    renderColumn(
      'Cost',
      buildModel({
        cost: 10,
        costTier: undefined,
        isFree: false,
        pricingType: PricingType.PER_MEGAPIXEL,
        providerCostUsd: 0.02,
      }),
      true,
    );

    const { tooltip } = focusCost('10');
    expect(tooltip).toHaveTextContent(
      'Provider $0.02 + Margin $0.08 = Total $0.10 (10 credits)',
    );
    expect(tooltip).toHaveTextContent('Basis: 1 megapixel');
  });

  it('says the provider breakdown is unavailable when the base cost is missing', () => {
    renderColumn(
      'Cost',
      buildModel({
        cost: 12,
        costTier: undefined,
        isFree: false,
        pricingType: PricingType.FLAT,
      }),
      true,
    );

    const { tooltip } = focusCost('12');
    expect(tooltip).toHaveTextContent('Provider breakdown unavailable');
    expect(tooltip).toHaveTextContent('Final price: 12 credits');
    expect(tooltip).not.toHaveTextContent('Margin');
  });

  it('does not treat an unsupported pricing type as a flat provider unit', () => {
    renderColumn(
      'Cost',
      buildModel({
        cost: 10,
        costTier: undefined,
        isFree: false,
        pricingType: PricingType.PER_REQUEST,
        providerCostUsd: 0.03,
      }),
      true,
    );
    renderColumn(
      'Cost',
      buildModel({
        cost: 10,
        costTier: undefined,
        isFree: false,
        pricingType: 'per-token' as PricingType,
        providerCostUsd: 0.03,
      }),
      true,
    );

    for (const cost of screen.getAllByText('10')) {
      fireEvent.focus(cost);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Provider breakdown unavailable');
      expect(tooltip).toHaveTextContent('Final price: 10 credits');
      expect(tooltip).not.toHaveTextContent('$0.03');
      fireEvent.keyDown(cost, { key: 'Escape' });
    }
  });

  it('names a free model and refuses a fabricated margin for an unpriced paid model', () => {
    renderColumn(
      'Cost',
      buildModel({ cost: 0, costTier: undefined, isFree: true }),
      true,
    );
    const free = screen.getByText('Free');
    fireEvent.focus(free);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Free');
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('$');
    fireEvent.keyDown(free, { key: 'Escape' });

    renderColumn(
      'Cost',
      buildModel({
        cost: 0,
        costTier: undefined,
        isFree: false,
        providerCostUsd: 0.03,
      }),
      true,
    );
    fireEvent.focus(screen.getByText('Unresolved'));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Pricing unavailable');
    expect(tooltip).toHaveTextContent(LOCKED_REASON);
    expect(tooltip).not.toHaveTextContent('$');
    expect(tooltip).not.toHaveTextContent('Margin');
  });

  it('opens the same breakdown on hover', async () => {
    vi.useFakeTimers();
    renderColumn(
      'Cost',
      buildModel({
        cost: 10,
        costTier: undefined,
        isFree: false,
        pricingType: PricingType.FLAT,
        providerCostUsd: 0.03,
      }),
      true,
    );
    const cost = screen.getByText('10');
    fireEvent.pointerMove(cost, { pointerType: 'mouse' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Provider $0.03 + Margin $0.07 = Total $0.10 (10 credits)',
    );
  });

  it('keeps the provider breakdown off the non-admin cost cell', () => {
    renderColumn(
      'Cost',
      buildModel({
        cost: 10,
        costTier: undefined,
        providerCostUsd: 0.03,
      }),
      false,
    );
    const cost = screen.getByText('10');
    expect(cost).not.toHaveAttribute('tabindex');
    fireEvent.focus(cost);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
