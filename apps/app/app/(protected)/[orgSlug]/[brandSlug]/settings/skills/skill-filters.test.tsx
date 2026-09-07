// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen } from '@testing-library/react';
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
  it('renders search input and source/modality/stage selects', () => {
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
    expect(
      screen.getByRole('combobox', { name: /filter skills by source/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /filter skills by modality/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', {
        name: /filter skills by workflow stage/i,
      }),
    ).toBeInTheDocument();
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
