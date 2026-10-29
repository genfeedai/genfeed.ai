// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SkillAgentAction, { SkillSearch } from './skill-filters';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

function renderSearch(
  overrides: Partial<ComponentProps<typeof SkillSearch>> = {},
) {
  return render(
    <SkillSearch
      modalityFilter="all"
      onModalityFilterChange={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onSourceFilterChange={vi.fn()}
      onStageFilterChange={vi.fn()}
      searchQuery=""
      sourceFilter="all"
      stageFilter="all"
      {...overrides}
    />,
  );
}

describe('SkillSearch', () => {
  it('carries the Source / Modality / Stage Filters menu inside the search field', async () => {
    const user = userEvent.setup();
    renderSearch();

    const search = screen.getByPlaceholderText(/search skills/i);
    const field = search.closest('div')?.parentElement as HTMLElement;
    expect(
      within(field).getByRole('button', { name: /^Filters/ }),
    ).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('menuitem', { name: /^Source/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Modality/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Stage/ })).toBeVisible();
  });

  it('reports a stage choice and counts it on the trigger', async () => {
    const user = userEvent.setup();
    const onStageFilterChange = vi.fn();
    renderSearch({ onStageFilterChange, sourceFilter: 'custom' });

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

  it('stays a persistent field and reports what the user types', () => {
    const onSearchQueryChange = vi.fn();
    renderSearch({ onSearchQueryChange });

    fireEvent.change(screen.getByPlaceholderText(/search skills/i), {
      target: { value: 'script' },
    });

    expect(onSearchQueryChange).toHaveBeenCalledWith('script');
  });
});

describe('SkillAgentAction', () => {
  it('links to the agent', () => {
    render(<SkillAgentAction agentHref="/acme-org/acme-creator/agent" />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/acme-org/acme-creator/agent',
    );
  });
});
