// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SkillFilters from './skill-filters';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

describe('SkillFilters', () => {
  it('renders search input and one Filters menu with source/modality/stage', async () => {
    const user = userEvent.setup();
    render(
      <SkillFilters
        agentHref="/acme-org/acme-creator/agent"
        modalityFilter="all"
        onModalityFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onSourceFilterChange={vi.fn()}
        onStageFilterChange={vi.fn()}
        searchQuery=""
        sourceFilter="all"
        stageFilter="all"
      />,
    );

    expect(
      screen.getByRole('textbox', { name: /search skills/i }),
    ).toBeInTheDocument();
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
        onRefresh={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onSourceFilterChange={vi.fn()}
        onStageFilterChange={onStageFilterChange}
        searchQuery=""
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

  it('calls onSearchQueryChange as the user types', () => {
    const onSearchQueryChange = vi.fn();
    render(
      <SkillFilters
        agentHref="/acme-org/acme-creator/agent"
        modalityFilter="all"
        onModalityFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onSearchQueryChange={onSearchQueryChange}
        onSourceFilterChange={vi.fn()}
        onStageFilterChange={vi.fn()}
        searchQuery=""
        sourceFilter="all"
        stageFilter="all"
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /search skills/i }), {
      target: { value: 'script' },
    });

    expect(onSearchQueryChange).toHaveBeenCalledWith('script');
  });

  it('calls onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(
      <SkillFilters
        agentHref="/acme-org/acme-creator/agent"
        modalityFilter="all"
        onModalityFilterChange={vi.fn()}
        onRefresh={onRefresh}
        onSearchQueryChange={vi.fn()}
        onSourceFilterChange={vi.fn()}
        onStageFilterChange={vi.fn()}
        searchQuery=""
        sourceFilter="all"
        stageFilter="all"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(onRefresh).toHaveBeenCalled();
  });
});
