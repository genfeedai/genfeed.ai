// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SkillFilters, { SkillSearch } from './skill-filters';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

describe('SkillFilters', () => {
  it('renders one Filters menu with source/modality/stage and no search', async () => {
    const user = userEvent.setup();
    render(
      <SkillFilters
        agentHref="/acme-org/acme-creator/agent"
        modalityFilter="all"
        onModalityFilterChange={vi.fn()}
        onSourceFilterChange={vi.fn()}
        onStageFilterChange={vi.fn()}
        sourceFilter="all"
        stageFilter="all"
      />,
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('menuitem', { name: /^Source/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Modality/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Stage/ })).toBeVisible();
  });

  it('reports a stage choice and counts it on the trigger', async () => {
    const user = userEvent.setup();
    const onStageFilterChange = vi.fn();
    render(
      <SkillFilters
        agentHref="/acme-org/acme-creator/agent"
        modalityFilter="all"
        onModalityFilterChange={vi.fn()}
        onSourceFilterChange={vi.fn()}
        onStageFilterChange={onStageFilterChange}
        sourceFilter="custom"
        stageFilter="all"
      />,
    );

    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent(
      '1',
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    screen.getByRole('menuitem', { name: /^Stage/ }).focus();
    await user.keyboard('{ArrowRight}');
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Research' }),
    );

    expect(onStageFilterChange).toHaveBeenCalledWith('research');
  });

  it('rests the search as an icon and reports what the user types', () => {
    const onSearchQueryChange = vi.fn();
    render(
      <SkillSearch onSearchQueryChange={onSearchQueryChange} searchQuery="" />,
    );

    expect(screen.getByTestId('collapsible-search')).toHaveAttribute(
      'data-state',
      'closed',
    );
    fireEvent.change(screen.getByPlaceholderText(/search skills/i), {
      target: { value: 'script' },
    });

    expect(onSearchQueryChange).toHaveBeenCalledWith('script');
  });
});
