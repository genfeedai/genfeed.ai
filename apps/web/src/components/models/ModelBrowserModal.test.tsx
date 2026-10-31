// @vitest-environment jsdom

import { ModelCategory, QualityTier } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelBrowserModal } from './ModelBrowserModal';

const mocks = vi.hoisted(() => ({
  addRecentModel: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/workflows/ui/stores', () => ({
  useSettingsStore: (selector: (state: object) => unknown) =>
    selector({
      addRecentModel: mocks.addRecentModel,
      recentModels: [
        {
          displayName: 'Veo 3',
          id: 'google/veo-3',
          provider: 'genfeed-ai',
          timestamp: 1,
        },
      ],
    }),
}));

function buildModel(overrides: Partial<IModel>): IModel {
  return {
    category: ModelCategory.IMAGE,
    key: 'google/nano-banana-pro',
    label: 'Nano Banana Pro',
    ...overrides,
  } as IModel;
}

const MODELS: IModel[] = [
  buildModel({
    description: 'Photoreal, text in image',
    qualityTier: QualityTier.ULTRA,
  }),
  buildModel({
    category: ModelCategory.VIDEO,
    key: 'google/veo-3',
    label: 'Veo 3',
    qualityTier: QualityTier.HIGH,
  }),
  buildModel({ key: 'black-forest-labs/flux-2-pro', label: 'Flux 2 Pro' }),
];

function renderModal(props: Partial<Parameters<typeof ModelBrowserModal>[0]>) {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  render(
    <ModelBrowserModal
      hasError={false}
      isLoading={false}
      isOpen
      models={MODELS}
      onClose={onClose}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onClose, onSelect };
}

describe('ModelBrowserModal', () => {
  beforeEach(() => {
    mocks.addRecentModel.mockClear();
  });

  it('lists catalog models with their quality tier and never shows a provider', () => {
    renderModal({});

    expect(screen.getByRole('dialog', { name: 'Choose a model' })).toBeTruthy();
    expect(screen.getAllByText('Nano Banana Pro')).toHaveLength(1);
    expect(screen.getByText('Photoreal, text in image')).toBeTruthy();
    expect(screen.getByText('Ultra')).toBeTruthy();
    expect(screen.queryByText(/replicate|openrouter|\.env/i)).toBeNull();
  });

  it('shows recently used models that are in the catalog first', () => {
    renderModal({});

    expect(screen.getByText('Recent')).toBeTruthy();
    // Veo 3 is listed once under Recent and once under All models.
    expect(screen.getAllByText('Veo 3')).toHaveLength(2);
  });

  it('filters by search and hides the recent section while searching', () => {
    renderModal({});

    fireEvent.change(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: 'flux' },
    });

    expect(screen.getByText('Flux 2 Pro')).toBeTruthy();
    expect(screen.queryByText('Nano Banana Pro')).toBeNull();
    expect(screen.queryByText('Recent')).toBeNull();
  });

  it('selects a model, records it as recent and closes', () => {
    const { onClose, onSelect } = renderModal({});

    fireEvent.click(screen.getByRole('button', { name: /Flux 2 Pro/ }));

    expect(onSelect).toHaveBeenCalledWith(MODELS[2]);
    expect(mocks.addRecentModel).toHaveBeenCalledWith({
      displayName: 'Flux 2 Pro',
      id: 'black-forest-labs/flux-2-pro',
      provider: 'genfeed-ai',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the current model as pressed', () => {
    renderModal({ selectedKey: 'black-forest-labs/flux-2-pro' });

    expect(
      screen
        .getByRole('button', { name: /Flux 2 Pro/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('shows loading, error and empty states', () => {
    const { unmount } = render(
      <ModelBrowserModal
        hasError={false}
        isLoading
        isOpen
        models={[]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('status', { name: 'Loading models…' }),
    ).toBeTruthy();
    unmount();

    render(
      <ModelBrowserModal
        hasError
        isLoading={false}
        isOpen
        models={[]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Models could not be loaded. Try again in a moment.'),
    ).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
