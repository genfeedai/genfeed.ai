import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { render, screen, within } from '@testing-library/react';
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

function renderSection(
  onSetField = vi.fn(),
  models: IModel[] = MODELS,
  modelKey = 'replicate/current',
) {
  render(
    <TooltipProvider>
      <GenerationSetupModelSection
        capabilities={CAPABILITIES}
        favoriteModelKeys={[]}
        models={models}
        onFavoriteToggle={vi.fn()}
        onSetField={onSetField}
        setup={{
          sources: {},
          values: { modelKey } as never,
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

  it('keeps legacy models behind one Legacy row', async () => {
    renderSection();

    expect(screen.getByText('Current Model')).toBeInTheDocument();
    expect(screen.getByText('Legacy')).toBeInTheDocument();
    expect(screen.queryByText('Old Model')).not.toBeInTheDocument();
  });

  it('opens the legacy models in a flyout when the row is clicked', async () => {
    renderSection();

    await userEvent.click(screen.getByText('Legacy'));

    const flyout = await screen.findByRole('dialog', {
      name: 'Legacy',
    });
    expect(within(flyout).getByText('Old Model')).toBeInTheDocument();
    expect(screen.getByText('Current Model')).toBeInTheDocument();
  });

  it('opens the flyout with the right arrow and picks a model with Enter', async () => {
    const onSetField = vi.fn();
    renderSection(onSetField);

    // Only the legacy row matches, so it is the highlighted row.
    await userEvent.type(screen.getByRole('combobox'), 'Old');
    await userEvent.keyboard('{ArrowRight}');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');

    expect(onSetField).toHaveBeenCalledWith('modelKey', 'replicate/old');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the flyout with the left arrow and with Escape', async () => {
    renderSection();

    await userEvent.type(screen.getByRole('combobox'), 'Old');
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never lists a retired model, even when searched for', async () => {
    renderSection();

    await userEvent.type(screen.getByRole('combobox'), 'Gone');

    expect(screen.queryByText('Gone Model')).not.toBeInTheDocument();
  });

  it('narrows the legacy row to the legacy models a search matches', async () => {
    renderSection();

    await userEvent.type(screen.getByRole('combobox'), 'Old');

    expect(screen.getByText('Legacy')).toBeInTheDocument();
    expect(screen.queryByText('Current Model')).not.toBeInTheDocument();
  });

  describe('model families', () => {
    const FAMILY_MODELS = [
      buildModel('openai/gpt-image-2', 'GPT Image 2', ModelLifecycle.AVAILABLE),
      buildModel(
        'openai/gpt-image-2-flare',
        'GPT Image 2.5 Flare',
        ModelLifecycle.AVAILABLE,
      ),
      buildModel('google/imagen-4', 'Imagen 4', ModelLifecycle.AVAILABLE),
    ];

    it('folds sibling models into one family row with a count and no inline variants', () => {
      renderSection(vi.fn(), FAMILY_MODELS, 'google/imagen-4');

      const family = screen.getByRole('option', { name: /GPT Image/ });
      expect(family).toHaveAttribute('aria-expanded', 'false');
      expect(within(family).getByText('2')).toBeInTheDocument();
      expect(screen.queryByText('GPT Image 2.5 Flare')).not.toBeInTheDocument();
      expect(screen.getByText('Imagen 4')).toBeInTheDocument();
    });

    it('opens the variants in a flyout and picks one', async () => {
      const onSetField = vi.fn();
      renderSection(onSetField, FAMILY_MODELS, 'google/imagen-4');

      await userEvent.click(screen.getByRole('option', { name: /GPT Image/ }));
      const flyout = await screen.findByRole('dialog', { name: 'GPT Image' });
      expect(within(flyout).getByText('GPT Image 2')).toBeInTheDocument();

      await userEvent.click(within(flyout).getByText('GPT Image 2.5 Flare'));
      expect(onSetField).toHaveBeenCalledWith(
        'modelKey',
        'openai/gpt-image-2-flare',
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the family flyout with the right arrow and closes it with the left', async () => {
      renderSection(vi.fn(), FAMILY_MODELS, 'google/imagen-4');

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.keyboard('{ArrowDown}');
      const family = screen.getByRole('option', { name: /GPT Image/ });
      await userEvent.hover(family);
      await userEvent.keyboard('{ArrowRight}');
      expect(await screen.findByRole('dialog')).toBeInTheDocument();

      await userEvent.keyboard('{ArrowLeft}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('lists matches flat while a search is typed', async () => {
      renderSection(vi.fn(), FAMILY_MODELS, 'google/imagen-4');

      await userEvent.type(screen.getByRole('combobox'), 'Flare');

      expect(screen.getByText('GPT Image 2.5 Flare')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not badge models inside the Legacy flyout', async () => {
      renderSection();

      await userEvent.click(screen.getByText('Legacy'));
      const flyout = await screen.findByRole('dialog', { name: 'Legacy' });

      expect(within(flyout).getByText('Old Model')).toBeInTheDocument();
      expect(
        within(flyout).queryByText('Legacy', { selector: 'span' }),
      ).not.toBeInTheDocument();
    });
  });
});
