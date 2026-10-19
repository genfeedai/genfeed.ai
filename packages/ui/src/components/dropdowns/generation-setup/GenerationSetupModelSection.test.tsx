import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupModelSection from '@ui/dropdowns/generation-setup/GenerationSetupModelSection';
import { TooltipProvider } from '@ui/primitives/tooltip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const CAPABILITIES = {
  hasModelSelection: true,
} as StudioPlaygroundCapabilities;

function buildModel(key: string, label: string, lifecycle: ModelLifecycle) {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    isActive: true,
    key,
    label,
    lifecycle,
  } as IModel;
}

const MODELS = [
  buildModel('replicate/current', 'Current Model', ModelLifecycle.AVAILABLE),
  buildModel('replicate/old', 'Old Model', ModelLifecycle.LEGACY),
  buildModel('genfeed-ai/gone', 'Gone Model', ModelLifecycle.RETIRED),
];

function renderSection() {
  render(
    <TooltipProvider>
      <GenerationSetupModelSection
        capabilities={CAPABILITIES}
        favoriteModelKeys={[]}
        models={MODELS}
        onFavoriteToggle={vi.fn()}
        onSetField={vi.fn()}
        setup={{
          sources: {},
          values: { modelKey: 'replicate/current' } as never,
        }}
      />
    </TooltipProvider>,
  );
}

describe('GenerationSetupModelSection', () => {
  beforeEach(() => {
    // cmdk calls scrollIntoView on the highlighted item; jsdom lacks it.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('keeps legacy models out of the catalog until the Legacy group is opened', async () => {
    renderSection();

    expect(screen.getByText('Current Model')).toBeInTheDocument();
    expect(screen.queryByText('Old Model')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /show legacy models/i }),
    );

    expect(screen.getByText('Old Model')).toBeInTheDocument();
  });

  it('never lists a retired model, even when searched for', async () => {
    renderSection();

    await userEvent.type(screen.getByRole('combobox'), 'Gone');

    expect(screen.queryByText('Gone Model')).not.toBeInTheDocument();
  });

  it('opens the Legacy group for a search that matches a legacy model', async () => {
    renderSection();

    await userEvent.type(screen.getByRole('combobox'), 'Old');

    expect(screen.getByText('Old Model')).toBeInTheDocument();
  });
});
