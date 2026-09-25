import {
  CostTier,
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  QualityTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildModelsTableColumns } from './ModelsTableColumns';

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
): void {
  const columns = buildModelsTableColumns({
    handleAdminToggle: vi.fn(),
    handleLifecycleChange: vi.fn(),
    handleToggleModel: vi.fn(),
    isAdminScope,
    isModelEnabled: () => true,
    isOnlyDefaultInCategory: () => false,
    onOpenDetails,
    togglingModelId: null,
    models: [model],
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
    });

    expect(columns.map((column) => column.header)).toContain('Quality');
    expect(columns.map((column) => column.header)).toContain('Cost');
    expect(columns.map((column) => column.header)).not.toContain('Description');
    expect(columns.map((column) => column.header)).not.toContain('Value');
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

  it('renders the provider as a branded pill', () => {
    renderColumn(
      'Provider',
      buildModel({ provider: ModelProvider.REPLICATE }),
      true,
    );

    expect(screen.getByText('Replicate')).toBeInTheDocument();
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

  it('renders canonical quality and exact credit cost when tiers are missing', () => {
    renderColumn('Quality', buildModel({ qualityTier: undefined }));
    renderColumn('Cost', buildModel({ costTier: undefined }));

    expect(screen.getByRole('meter', { name: 'Quality' })).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('1 credit')).toBeInTheDocument();
  });

  it('distinguishes a zero credit price from an explicitly free model', () => {
    renderColumn('Cost', buildModel({ cost: 0, costTier: undefined }));
    renderColumn(
      'Cost',
      buildModel({ cost: 0, costTier: undefined, isFree: true }),
    );

    expect(screen.getByText('0 credits')).toBeInTheDocument();
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
    });

    const labelColumn = columns.find((column) => column.header === 'Label');

    expect(labelColumn?.subtext?.(model)).toBe('Detailed model description');
  });
});
